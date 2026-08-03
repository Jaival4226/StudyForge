import json
import uuid
from django.utils import timezone
from .models import Workspace, Document, ConceptNode, ConceptEdge, NodeResource, ConceptEvent, ConceptMastery
from .vector_store import VectorStoreService
from .ai_engine import AIEngine
from .mongo_service import ChatMemoryService

class GraphEngine:
    MERGE_THRESHOLD = 0.15
    NEW_THRESHOLD = 0.35
    
    W_OVERDUE = 0.4
    W_WEAKNESS = 0.4
    W_READINESS = 0.2

    @staticmethod
    def _parse_llm_json(response_text):
        try:
            clean = response_text.replace("```json", "").replace("```", "").strip()
            return json.loads(clean)
        except Exception:
            return None

    @staticmethod
    def ingest_document(workspace_id, document_id, chunks=None):
        print(f"🧠 [Cortex] Starting extraction for Document {document_id}")
        document = Document.objects.get(id=document_id)
        
        # If we weren't handed chunks in memory, fall back to querying ChromaDB
        if not chunks:
            print(f"🧠 [Cortex] Querying Vector Store as fallback...")
            chunks = VectorStoreService.query_workspace_context(
                workspace_id=workspace_id,
                query_text="core concepts knowledge explanations summary definitions", 
                n_results=100,
                selected_doc_ids=[str(document_id)]
            )
            
        if not chunks: 
            print(f"⚠️ [Cortex] No chunks found for Document {document_id}")
            return

        print(f"🧠 [Cortex] Sending {len(chunks)} chunks to LLM for concept extraction...")
        context_text = "\n\n".join([f"SOURCE_TAG: [{c.get('location', 'Unknown')}]\nTEXT: {c.get('text', '')}" for c in chunks])
        
        sys_prompt = f"""
        Extract up to 15 core concepts from the text. Return STRICT JSON (no markdown blocks).
        Schema: [{{"name": "Concept Name", "summary": "One line summary", "details": "Paragraph of details", "source_tags": ["[file.pdf|Page 1]"]}}]
        TEXT: {context_text}
        """
        response = AIEngine._execute_with_fallback(sys_prompt)
        candidates = GraphEngine._parse_llm_json(response) or []
        print(f"🧠 [Cortex] LLM extracted {len(candidates)} concepts. Mapping to graph...")

        collection = VectorStoreService.get_concept_collection(workspace_id)
        embedding_fn = VectorStoreService.get_embedding_function()
        
        nodes_created = 0
        nodes_merged = 0
        edges_inferred = 0

        workspace = Workspace.objects.get(id=workspace_id)

        for cand in candidates:
            cand_text = f"{cand['name']}. {cand['summary']}"
            embeds = embedding_fn([cand_text])
            
            results = collection.query(query_embeddings=embeds, n_results=3)
            nearest_id = None
            distance = 1.0

            if results['ids'] and results['ids'][0]:
                nearest_id = results['ids'][0][0]
                distance = results['distances'][0][0]

            target_node = None
            target_node_candidate = None
            
            # FIX: Safely check if the node exists in SQLite to prevent "DoesNotExist" crashes
            # caused by previous database lock failures leaving phantom records in ChromaDB.
            if nearest_id:
                target_node_candidate = ConceptNode.objects.filter(embedding_id=nearest_id).first()
                
            # If ChromaDB has an ID but SQLite doesn't, force it to be treated as a NEW concept
            if not target_node_candidate:
                distance = 1.0

            if distance < GraphEngine.MERGE_THRESHOLD and target_node_candidate:
                target_node = target_node_candidate
                ConceptEvent.objects.create(node=target_node, event_type='resource_merged', description=f"Auto-merged from {document.title}", document=document)
                nodes_merged += 1
            elif distance > GraphEngine.NEW_THRESHOLD:
                new_uuid = str(uuid.uuid4())
                target_node = ConceptNode.objects.create(
                    workspace_id=workspace_id, canonical_tag=cand['name'], label=cand['name'],
                    summary=cand['summary'], details=cand['details'], embedding_id=new_uuid
                )
                collection.add(ids=[new_uuid], embeddings=embeds, metadatas=[{"label": cand['name']}])
                ConceptEvent.objects.create(node=target_node, event_type='node_created', description=f"Created from {document.title}", document=document)
                nodes_created += 1
            else:
                adj_prompt = f"Are these the exact same concept? Return strictly {{\"same\": true/false, \"rationale\": \"...\"}}.\n1: {target_node_candidate.label} - {target_node_candidate.summary}\n2: {cand['name']} - {cand['summary']}"
                adj_resp = GraphEngine._parse_llm_json(AIEngine._execute_with_fallback(adj_prompt))
                
                if adj_resp and adj_resp.get("same"):
                    target_node = target_node_candidate
                    ConceptEvent.objects.create(node=target_node, event_type='resource_merged', description=f"LLM Adjudicated Merge: {adj_resp.get('rationale')}", document=document)
                    nodes_merged += 1
                else:
                    new_uuid = str(uuid.uuid4())
                    target_node = ConceptNode.objects.create(
                        workspace_id=workspace_id, canonical_tag=cand['name'], label=cand['name'],
                        summary=cand['summary'], details=cand['details'], embedding_id=new_uuid
                    )
                    collection.add(ids=[new_uuid], embeddings=embeds, metadatas=[{"label": cand['name']}])
                    ConceptEvent.objects.create(node=target_node, event_type='node_created', description=f"LLM Adjudicated Split: {adj_resp.get('rationale') if adj_resp else 'Distinct'}", document=document)
                    nodes_created += 1

            if target_node:
                for tag in cand.get("source_tags", []):
                    if not NodeResource.objects.filter(node=target_node, source_tag=tag).exists():
                        NodeResource.objects.create(node=target_node, document=document, source_tag=tag, title=document.title, resource_type=document.type)

                if target_node.embedding_id == nearest_id and target_node_candidate:
                    aug_prompt = f"Does TEXT 2 add new factual details to TEXT 1? Return {{\"adds_info\": true/false, \"new_details\": \"Only strictly new info\"}}.\nTEXT 1: {target_node.details}\nTEXT 2: {cand['details']}"
                    aug_resp = GraphEngine._parse_llm_json(AIEngine._execute_with_fallback(aug_prompt))
                    if aug_resp and aug_resp.get("adds_info"):
                        target_node.details += f"\n\n{aug_resp.get('new_details')}"
                        target_node.version += 1
                        target_node.save()
                        ConceptEvent.objects.create(node=target_node, event_type='detail_augmented', description="Details augmented from new source.", document=document)

                neighbors = collection.query(query_embeddings=embeds, n_results=6)
                if neighbors['ids'] and neighbors['ids'][0]:
                    neighbor_ids = [nid for nid in neighbors['ids'][0] if nid != target_node.embedding_id][:5]
                    if neighbor_ids:
                        neighbor_nodes = list(ConceptNode.objects.filter(embedding_id__in=neighbor_ids))
                        mapping_str = "\n".join([f"ID {n.id}: {n.label} - {n.summary}" for n in neighbor_nodes])
                        edge_prompt = f"Given concept '{target_node.label}', which does it relate to? Return strictly JSON array: [{{'target_id': ID, 'type': 'prerequisite' | 'builds_on' | 'related_to' | 'contrasts_with'}}]\n{mapping_str}"
                        edge_resp = GraphEngine._parse_llm_json(AIEngine._execute_with_fallback(edge_prompt)) or []
                        
                        for edge_data in edge_resp:
                            try:
                                n_id = int(edge_data.get('target_id'))
                                rel_type = edge_data.get('type')
                                if rel_type in [c[0] for c in ConceptEdge.RELATIONSHIP_CHOICES]:
                                    tgt = next((n for n in neighbor_nodes if n.id == n_id), None)
                                    if tgt and not ConceptEdge.objects.filter(source_node=target_node, target_node=tgt).exists():
                                        ConceptEdge.objects.create(workspace_id=workspace_id, source_node=target_node, target_node=tgt, relationship_type=rel_type, label=rel_type.replace('_', ' ').title(), confidence=0.85)
                                        ConceptEvent.objects.create(node=target_node, event_type='edge_inferred', description=f"Inferred {rel_type} connection to {tgt.label}", document=document)
                                        edges_inferred += 1
                            except: pass

        for node in ConceptNode.objects.filter(workspace_id=workspace_id, mastery_records__isnull=True):
            ConceptMastery.objects.filter(workspace_id=workspace_id, tag__iexact=node.canonical_tag).update(concept_node=node)

        print(f"✅ [Cortex] Final Results: {nodes_created} nodes created, {nodes_merged} merged, {edges_inferred} edges inferred.")
        
        if nodes_created > 0 or nodes_merged > 0:
            sys_msg = f"🧠 Cortex updated from {document.title}: {nodes_created} new concepts, {nodes_merged} sources merged, {edges_inferred} connections mapped."
            ChatMemoryService().save_message(workspace_id, user_id="system", role="ai", text=sys_msg)

    @staticmethod
    def get_recommended_path(workspace_id, user_id):
        nodes = ConceptNode.objects.filter(workspace_id=workspace_id)
        scored_nodes = []
        now = timezone.now()

        for node in nodes:
            mastery = node.mastery_records.filter(user_id=user_id).first()
            if not mastery: continue

            days_diff = (now - mastery.next_review_due).days if mastery.next_review_due else 0
            overdue_score = max(0.0, min(days_diff / 7.0, 1.0))
            weakness_score = mastery.incorrect_count / (mastery.correct_count + mastery.incorrect_count + 1)
            
            prereqs = ConceptEdge.objects.filter(target_node=node, relationship_type='prerequisite').select_related('source_node')
            prereq_weaknesses = [edge.source_node.mastery_records.filter(user_id=user_id).first() for edge in prereqs]
            prereq_weaknesses = [m.incorrect_count / (m.correct_count + m.incorrect_count + 1) for m in prereq_weaknesses if m]
            
            readiness_score = 1.0
            if prereq_weaknesses:
                readiness_score = sum(1 for w in prereq_weaknesses if w < 0.3) / len(prereq_weaknesses)

            priority = (GraphEngine.W_OVERDUE * overdue_score) + (GraphEngine.W_WEAKNESS * weakness_score) + (GraphEngine.W_READINESS * readiness_score)
            scored_nodes.append({"id": node.id, "priority": priority})

        scored_nodes.sort(key=lambda x: x['priority'], reverse=True)
        return [n['id'] for n in scored_nodes]