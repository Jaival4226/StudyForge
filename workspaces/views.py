import threading
import urllib.request
import json
import traceback
from django.http import StreamingHttpResponse
from django.contrib.auth.models import User
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, JSONParser
from rest_framework.authtoken.models import Token

from .models import Workspace, Document, Artifact, ConceptNode, ConceptEdge
from .serializers import WorkspaceSerializer, DocumentSerializer, ArtifactSerializer

from .ingestion import IngestionEngine
from .vector_store import VectorStoreService
from .ai_engine import AIEngine
from .graph_engine import GraphEngine
from .mastery_service import MasteryService
from .mongo_service import ChatMemoryService


# ==========================================
# AUTHENTICATION ENDPOINTS
# ==========================================

@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not username or not password:
        return Response({'error': 'Username and password required'}, status=status.HTTP_400_BAD_REQUEST)
        
    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username already exists'}, status=status.HTTP_400_BAD_REQUEST)
        
    user = User.objects.create_user(username=username, password=password)
    token, _ = Token.objects.get_or_create(user=user)
    
    return Response({'token': token.key}, status=status.HTTP_201_CREATED)


# ==========================================
# VIEWSETS
# ==========================================

class WorkspaceViewSet(viewsets.ModelViewSet):
    queryset = Workspace.objects.all().order_by('-created_at')
    serializer_class = WorkspaceSerializer

    @action(detail=True, methods=['post'])
    def chat(self, request, pk=None):
        user_query = request.data.get('query')
        if not user_query:
            return Response({"error": "Please provide a 'query'."}, status=status.HTTP_400_BAD_REQUEST)

        user_id = request.user.id if request.user and request.user.is_authenticated else "anonymous"

        def stream_response():
            try:
                generator = AIEngine.chat_with_workspace(workspace_id=pk, user_query=user_query, user_id=user_id)
                for chunk in generator:
                    yield chunk
            except Exception as e:
                yield f"❌ Error starting stream: {str(e)}"

        return StreamingHttpResponse(stream_response(), content_type='text/plain')

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        docs = ChatMemoryService().get_chat_history(workspace_id=pk)
        for d in docs:
            d['_id'] = str(d['_id'])
        return Response({"history": docs})

    @action(detail=True, methods=['get'])
    def graph(self, request, pk=None):
        nodes = ConceptNode.objects.filter(workspace_id=pk)
        edges = ConceptEdge.objects.filter(workspace_id=pk)
        user_id = request.user.id if request.user and request.user.is_authenticated else "anonymous"

        node_data = []
        for n in nodes:
            mastery = n.mastery_records.filter(user_id=user_id).first()
            resources = [{"title": r.title, "source_tag": r.source_tag, "type": r.resource_type} for r in n.resources.all()]
            events = [{"type": e.event_type, "desc": e.description, "date": e.created_at} for e in n.events.all().order_by('-created_at')]
            
            node_data.append({
                "id": str(n.id),
                "data": {
                    "label": n.label, "summary": n.summary, "details": n.details,
                    "version": n.version, "updated_at": n.updated_at,
                    "resources": resources, "events": events,
                    "mastery_state": "mastered" if mastery and mastery.correct_count > mastery.incorrect_count else "weak" if mastery else "none"
                }
            })
            
        edge_data = [{"id": f"e{e.source_node_id}-{e.target_node_id}", "source": str(e.source_node_id), "target": str(e.target_node_id), "type": e.relationship_type, "label": e.label, "created_at": e.created_at} for e in edges]
        return Response({"nodes": node_data, "edges": edge_data})

    @action(detail=True, methods=['get'])
    def recommended_path(self, request, pk=None):
        user_id = request.user.id if request.user and request.user.is_authenticated else "anonymous"
        path_ids = GraphEngine.get_recommended_path(workspace_id=pk, user_id=user_id)
        return Response({"path": path_ids})

    @action(detail=True, methods=['post'])
    def generate_artifact(self, request, pk=None):
        prompt = request.data.get('prompt', '')
        title = request.data.get('title', 'Generated Artifact')
        artifact_type = request.data.get('artifact_type', 'markdown')
        selected_docs = request.data.get('selected_docs', [])

        if artifact_type == 'graph':
            for doc_id in selected_docs:
                threading.Thread(target=GraphEngine.ingest_document, args=(pk, doc_id)).start()
            return Response({"status": "Cortex ingestion started in background."})

        try:
            content = AIEngine.generate_artifact(workspace_id=pk, user_query=prompt, artifact_type=artifact_type, selected_doc_ids=selected_docs)
            artifact = Artifact.objects.create(workspace_id=pk, title=f"{artifact_type.capitalize()}: {title}", artifact_type=artifact_type, content=content)
            serializer = ArtifactSerializer(artifact)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def add_collaborator(self, request, pk=None):
        workspace = self.get_object()
        username = request.data.get('username')
        if not username: return Response({'error': 'Username required'}, status=400)
        try:
            user = User.objects.get(username=username)
            workspace.collaborators.add(user)
            return Response({'message': f'Added {username} to workspace.'})
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=404)

    @action(detail=True, methods=['post'])
    def remove_collaborator(self, request, pk=None):
        workspace = self.get_object()
        username = request.data.get('username')
        try:
            user = User.objects.get(username=username)
            workspace.collaborators.remove(user)
            return Response({'message': f'Removed {username} from workspace.'})
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=404)

    @action(detail=True, methods=['get'])
    def list_collaborators(self, request, pk=None):
        workspace = self.get_object()
        collabs = [u.username for u in workspace.collaborators.all()]
        return Response({'collaborators': collabs})

    @action(detail=True, methods=['get'])
    def list_documents(self, request, pk=None):
        docs = Document.objects.filter(workspace_id=pk)
        serializer = DocumentSerializer(docs, many=True)
        return Response({'documents': serializer.data})

    @action(detail=True, methods=['post'])
    def delete_document(self, request, pk=None):
        doc_id = request.data.get('document_id')
        try:
            doc = Document.objects.get(id=doc_id, workspace_id=pk)
            doc.delete()
            return Response({'message': 'Document deleted.'})
        except Document.DoesNotExist:
            return Response({'error': 'Document not found.'}, status=404)

    @action(detail=True, methods=['get'])
    def daily_review(self, request, pk=None):
        user_id = request.user.id
        due_tags = MasteryService.get_due_concepts(workspace_id=pk, user_id=user_id, limit=10)
        
        review_items = []
        for tag in due_tags:
            chunks = VectorStoreService.query_workspace_context(workspace_id=pk, query_text=tag, n_results=1)
            snippet = chunks[0]['text'][:300] + "..." if chunks else "Definition context missing."
            location = chunks[0]['location'] if chunks else "Unknown Source"
            review_items.append({"tag": tag, "snippet": snippet, "location": location})
            
        return Response({"review_items": review_items})

    @action(detail=True, methods=['post'])
    def record_mastery(self, request, pk=None):
        tag = request.data.get('tag')
        correct = request.data.get('correct', False)
        MasteryService.record_result(workspace_id=pk, user_id=request.user.id, tag=tag, was_correct=correct)
        return Response({"status": "recorded"})


class ArtifactViewSet(viewsets.ModelViewSet):
    queryset = Artifact.objects.all().order_by('-created_at')
    serializer_class = ArtifactSerializer

    @action(detail=True, methods=['patch'])
    def update_progress(self, request, pk=None):
        artifact = self.get_object()
        artifact.progress_state = request.data.get('progress_state', {})
        artifact.save()
        return Response({"status": "updated"})

    @action(detail=True, methods=['post'])
    def record_review(self, request, pk=None):
        artifact = self.get_object()
        tag = request.data.get('tag')
        correct = request.data.get('correct', False)
        MasteryService.record_result(workspace_id=artifact.workspace.id, user_id=request.user.id, tag=tag, was_correct=correct)
        return Response({"status": "recorded"})


# ==========================================
# UPLOAD & BACKGROUND GENERATION
# ==========================================

def background_auto_generate(workspace_id, document_id, chunks):
    """
    Background task for processing documents into the Cortex graph.
    """
    print(f"🧠 [Cortex] Starting background thread for Document {document_id}...")
    try:
        GraphEngine.ingest_document(workspace_id, document_id, chunks)
        print(f"✅ [Cortex] Finished ingesting Document {document_id}")
    except Exception as e:
        print(f"❌ [Cortex] Ingestion Failed: {e}")
        traceback.print_exc()


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all().order_by('-created_at')
    serializer_class = DocumentSerializer

    def perform_create(self, serializer):
        if 'workspace' not in serializer.validated_data:
            workspace_id = self.request.data.get('workspace')
            if workspace_id:
                try:
                    workspace = Workspace.objects.get(id=workspace_id)
                    serializer.validated_data['workspace'] = workspace
                except Workspace.DoesNotExist:
                    pass

        document = serializer.save()
        workspace_id = document.workspace.id

        try:
            chunks = []
            if document.type == 'pdf' and document.file_upload:
                chunks = IngestionEngine.process_pdf(document.file_upload.path)
            elif document.type == 'video' and document.source_url:
                chunks = IngestionEngine.process_youtube(document.source_url)

            if chunks:
                VectorStoreService.index_document_chunks(
                    workspace_id=workspace_id,
                    document_id=document.id,
                    chunks=chunks
                )
                threading.Thread(target=background_auto_generate, args=(workspace_id, document.id, chunks)).start()
        except Exception as e:
            print(f"❌ Error processing Document {document.id}: {str(e)}")


class FileUploadView(APIView):
    parser_classes = (MultiPartParser, JSONParser)

    def post(self, request, *args, **kwargs):
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        
        if 'workspace' not in data and 'workspace_id' in data:
            data['workspace'] = data['workspace_id']

        # Intercept frontend media types and map them to the serializer choices
        if data.get('type') == 'youtube':
            data['type'] = 'video'
        elif data.get('type') == 'file':
            data['type'] = 'pdf'

        if 'youtube_url' in data:
            data['source_url'] = data['youtube_url']
        if 'file' in request.FILES:
            data['file_upload'] = request.FILES['file']

        if not data.get('title') or data.get('title').strip() == '':
            if 'file_upload' in data:
                data['title'] = data['file_upload'].name
            elif 'source_url' in data:
                try:
                    url = data['source_url']
                    oembed_url = f"https://www.youtube.com/oembed?url={url}&format=json"
                    with urllib.request.urlopen(oembed_url) as response:
                        oembed_data = json.loads(response.read().decode())
                        data['title'] = oembed_data.get('title', url)
                except Exception as e:
                    print(f"⚠️ Could not fetch YouTube title: {e}")
                    data['title'] = data['source_url']
            else:
                data['title'] = "Untitled Document"

        serializer = DocumentSerializer(data=data)
        
        if serializer.is_valid():
            if 'workspace' not in serializer.validated_data and 'workspace' in data:
                try:
                    workspace = Workspace.objects.get(id=data['workspace'])
                    serializer.validated_data['workspace'] = workspace
                except Workspace.DoesNotExist:
                    pass

            document = serializer.save()
            workspace_id = document.workspace.id
            
            try:
                chunks = []
                if document.type == 'pdf' and document.file_upload:
                    chunks = IngestionEngine.process_pdf(document.file_upload.path)
                elif document.type == 'video' and document.source_url:
                    chunks = IngestionEngine.process_youtube(document.source_url)

                if chunks:
                    VectorStoreService.index_document_chunks(
                        workspace_id=workspace_id,
                        document_id=document.id,
                        chunks=chunks
                    )
                    threading.Thread(target=background_auto_generate, args=(workspace_id, document.id, chunks)).start()
                else:
                    print(f"⚠️ No chunks extracted from Document {document.id}")
                    
            except Exception as e:
                print(f"❌ Error processing upload: {e}")
                
            response_data = serializer.data
            response_data['message'] = document.title 
            
            return Response(response_data, status=status.HTTP_201_CREATED)
        
        print("❌ Serializer Validation Errors:", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)