# workspaces/views.py

import os
import json
import urllib.request
import traceback
import re
import threading
from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import PermissionDenied

from .models import Workspace, Document, Artifact
from .serializers import WorkspaceSerializer, DocumentSerializer, ArtifactSerializer
from .ingestion import IngestionEngine
from .vector_store import VectorStoreService
from .ai_engine import AIEngine
from .mongo_service import ChatMemoryService
from .mastery_service import MasteryService

def background_auto_generate(workspace_id, document_id, document_title):
    try:
        workspace = Workspace.objects.get(id=workspace_id)
        
        artifacts_to_create = [
            ('markdown', f"Study Guide: {document_title}", f"Create a comprehensive study guide for {document_title}."),
            ('graph', f"Concept Map: {document_title}", f"Map out the core concepts from {document_title}."),
            ('flashcards', f"Flashcards: {document_title}", f"Create 5-8 interactive flashcards covering the key terms in {document_title}."),
            ('quiz', f"Quiz: {document_title}", f"Create a 5-question multiple choice quiz testing knowledge from {document_title}.")
        ]
        
        for art_type, title, prompt in artifacts_to_create:
            try:
                content = AIEngine.generate_artifact(
                    workspace_id=workspace_id,
                    user_query=prompt,
                    artifact_type=art_type,
                    selected_doc_ids=[str(document_id)] 
                )
                Artifact.objects.create(
                    workspace=workspace,
                    title=title,
                    content=content,
                    artifact_type=art_type
                )
                print(f"✅ Successfully auto-generated {art_type} for {document_title}")
            except Exception as e:
                print(f"❌ Auto-gen failed for {art_type}: {e}")
                
    except Exception as e:
        print(f"❌ Background thread failed: {e}")

@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response({'error': 'Username and password required.'}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username already taken.'}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, password=password)
    Workspace.objects.create(owner=user)

    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key}, status=status.HTTP_201_CREATED)

class WorkspaceViewSet(viewsets.ModelViewSet):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Workspace.objects.filter(Q(owner=user) | Q(collaborators=user)).distinct()

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=['post'])
    def add_collaborator(self, request, pk=None):
        workspace = self.get_object()
        username_to_add = request.data.get('username')
        if workspace.owner != request.user:
            return Response({'error': 'Only the workspace owner can add collaborators.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            user_to_add = User.objects.get(username=username_to_add)
            if user_to_add == workspace.owner:
                return Response({'error': 'You are already the owner of this workspace.'}, status=status.HTTP_400_BAD_REQUEST)
            workspace.collaborators.add(user_to_add)
            return Response({'message': f'Successfully added {username_to_add} to the workspace!'}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found. Check the username and try again.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def chat(self, request, pk=None):
        workspace = self.get_object() 
        user_message = request.data.get('message') or request.data.get('query') or request.data.get('prompt')
        if not user_message:
            return Response({"error": "Message is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ai_response_dict = AIEngine.chat_with_workspace(
                workspace_id=workspace.id, 
                user_query=user_message,
                user_id=request.user.id
            )
            return Response(ai_response_dict, status=status.HTTP_200_OK)
        except Exception as e:
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def generate_artifact(self, request, pk=None):
        workspace = self.get_object()
        prompt = request.data.get('prompt')
        title = request.data.get('title', 'Generated Artifact')
        artifact_type = request.data.get('artifact_type', 'markdown')
        selected_docs = request.data.get('selected_docs', None)

        if not prompt:
            return Response({"error": "A prompt is required to generate an artifact."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            generated_content = AIEngine.generate_artifact(
                workspace_id=workspace.id,
                user_query=prompt,
                artifact_type=artifact_type,
                selected_doc_ids=selected_docs
            )
            artifact = Artifact.objects.create(
                workspace=workspace,
                title=title,
                content=generated_content,
                artifact_type=artifact_type
            )
            return Response(ArtifactSerializer(artifact).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def list_collaborators(self, request, pk=None):
        workspace = self.get_object()
        collaborators = workspace.collaborators.all().values_list('username', flat=True)
        return Response({"collaborators": list(collaborators)}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def remove_collaborator(self, request, pk=None):
        workspace = self.get_object()
        username_to_remove = request.data.get('username')
        if workspace.owner != request.user:
            return Response({'error': 'Only the workspace owner can remove collaborators.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            user_to_remove = User.objects.get(username=username_to_remove)
            workspace.collaborators.remove(user_to_remove)
            return Response({'message': f'Successfully removed {username_to_remove}'}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        try:
            workspace = self.get_object()
            mongo_service = ChatMemoryService()
            raw_history = mongo_service.get_chat_history(
                workspace_id=workspace.id,
                user_id=request.user.id
            )
            formatted_history = [{'role': msg['role'], 'text': msg['text']} for msg in raw_history]
            return Response({'history': formatted_history}, status=status.HTTP_200_OK)
        except Exception as e:
            traceback.print_exc()
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def list_documents(self, request, pk=None):
        workspace = self.get_object()
        docs = Document.objects.filter(workspace=workspace)
        doc_list = []
        for doc in docs:
            name = doc.title if doc.title else f"Document #{doc.id}"
            doc_list.append({"id": doc.id, "name": name})
        return Response({"documents": doc_list}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def delete_document(self, request, pk=None):
        workspace = self.get_object()
        if workspace.owner != request.user:
            return Response({'error': 'Only the owner can delete files.'}, status=status.HTTP_403_FORBIDDEN)
        doc_id = request.data.get('document_id')
        try:
            doc = Document.objects.get(id=doc_id, workspace=workspace)
            VectorStoreService.delete_document_chunks(workspace.id, doc.id)
            doc.delete()
            return Response({'message': 'Document deleted successfully'}, status=status.HTTP_200_OK)
        except Document.DoesNotExist:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'])
    def daily_review(self, request, pk=None):
        try:
            workspace = self.get_object()
            tags = MasteryService.get_due_concepts(workspace.id, request.user.id, limit=10)
            
            review_items = []
            for tag in tags:
                snippets = VectorStoreService.query_workspace_context(
                    workspace_id=workspace.id,
                    query_text=tag,
                    n_results=1,
                    distance_threshold=5.0 
                )
                
                snippet_text = snippets[0]['text'] if snippets else "No direct context snippet found."
                location = snippets[0]['location'] if snippets else "Unknown Source"
                
                review_items.append({
                    "tag": tag,
                    "snippet": snippet_text,
                    "location": location
                })
                
            return Response({"review_items": review_items}, status=status.HTTP_200_OK)
        except Exception as e:
            traceback.print_exc()
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def record_mastery(self, request, pk=None):
        workspace = self.get_object()
        tag = request.data.get('tag')
        correct = request.data.get('correct', False)
        if not tag:
            return Response({"error": "Tag is required."}, status=status.HTTP_400_BAD_REQUEST)
        MasteryService.record_result(workspace.id, request.user.id, tag, correct)
        return Response({"status": "recorded"}, status=status.HTTP_200_OK)


# --- UPDATED: ArtifactViewSet now forces strict privacy on progress_state ---
class ArtifactViewSet(viewsets.ModelViewSet):
    serializer_class = ArtifactSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Artifact.objects.filter(
            Q(workspace__owner=user) | Q(workspace__collaborators=user)
        ).distinct().order_by('-created_at')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        data = serializer.data
        user_id = str(request.user.id)
        
        # Privacy Filter: Only return the progress that belongs to the current user
        for item in data:
            prog = item.get('progress_state') or {}
            if 'nodes' in prog or 'headings' in prog:
                item['progress_state'] = {} # Wipe out legacy unsecured progress
            else:
                item['progress_state'] = prog.get(user_id, {})
                
        return Response(data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        data = serializer.data
        user_id = str(request.user.id)
        
        prog = data.get('progress_state') or {}
        if 'nodes' in prog or 'headings' in prog:
            data['progress_state'] = {}
        else:
            data['progress_state'] = prog.get(user_id, {})
            
        return Response(data)

    def perform_create(self, serializer):
        workspace = serializer.validated_data.get('workspace')
        user = self.request.user
        if workspace and workspace.owner != user and user not in workspace.collaborators.all():
            raise PermissionDenied("You do not have permission to add artifacts to this workspace.")
        serializer.save()

    @action(detail=True, methods=['patch'])
    def update_progress(self, request, pk=None):
        try:
            artifact = self.get_object()
            user_id = str(request.user.id)
            new_prog = request.data.get('progress_state', {})
            
            if not isinstance(artifact.progress_state, dict):
                artifact.progress_state = {}
                
            # Safely inject this user's progress without touching anyone else's data
            current_state = artifact.progress_state
            
            if 'nodes' in current_state: del current_state['nodes']
            if 'headings' in current_state: del current_state['headings']
            
            current_state[user_id] = new_prog
            artifact.progress_state = current_state
            artifact.save()
            
            return Response(new_prog, status=status.HTTP_200_OK)
        except Exception as e:
            traceback.print_exc()
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def record_review(self, request, pk=None):
        try:
            artifact = self.get_object()
            tag = request.data.get('tag')
            correct = request.data.get('correct', False)

            if not tag:
                return Response({"error": "Tag is required."}, status=status.HTTP_400_BAD_REQUEST)

            MasteryService.record_result(
                workspace_id=artifact.workspace.id,
                user_id=request.user.id,
                tag=tag,
                was_correct=correct
            )
            return Response({"status": "recorded"}, status=status.HTTP_200_OK)
        except Exception as e:
            traceback.print_exc()
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Document.objects.filter(
            Q(workspace__owner=user) | Q(workspace__collaborators=user)
        ).distinct().order_by('-created_at')

    def perform_create(self, serializer):
        if 'workspace' not in serializer.validated_data:
            workspace_id = self.request.data.get('workspace')
            if workspace_id:
                try:
                    workspace = Workspace.objects.get(id=workspace_id)
                    serializer.validated_data['workspace'] = workspace
                except Workspace.DoesNotExist:
                    pass

        workspace = serializer.validated_data.get('workspace')
        user = self.request.user
        if workspace and workspace.owner != user and user not in workspace.collaborators.all():
            raise PermissionDenied("You do not have permission to add documents to this workspace.")

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
        except Exception as e:
            print(f"  Error processing Document {document.id}: {str(e)}")

class FileUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        upload_type = request.data.get('type', 'file')
        workspace_id = request.data.get('workspace_id')

        if not workspace_id:
            return Response({"error": "Workspace ID is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            workspace = Workspace.objects.get(id=workspace_id)
            if workspace.owner != request.user and request.user not in workspace.collaborators.all():
                return Response({"error": "You do not have permission to upload to this workspace."}, status=status.HTTP_403_FORBIDDEN)

            chunks = []
            final_title = ""
            source_url = ""

            if upload_type == 'youtube':
                youtube_url = request.data.get('youtube_url')
                if not youtube_url:
                    return Response({"error": "No YouTube URL provided"}, status=status.HTTP_400_BAD_REQUEST)
                
                source_url = youtube_url
                video_id_match = re.search(r'(?:v=|/v/|youtu\.be/|/embed/)([a-zA-Z0-9_-]{11})', youtube_url)
                video_id = video_id_match.group(1) if video_id_match else youtube_url[-11:]
                final_title = f"YouTube Video: {video_id}"
                
                try:
                    oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
                    req = urllib.request.Request(oembed_url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=3) as resp:
                        meta = json.loads(resp.read().decode('utf-8'))
                        final_title = meta.get('title', final_title)
                except Exception:
                    pass

                chunks = IngestionEngine.process_youtube(youtube_url)
                if not chunks:
                    return Response({"error": "Failed to extract transcript from YouTube video."}, status=status.HTTP_400_BAD_REQUEST)

            elif upload_type == 'file':
                file_obj = request.FILES.get('file')
                if not file_obj:
                    return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)
                
                custom_title = request.data.get('title', '').strip()
                final_title = custom_title if custom_title else file_obj.name
                
                upload_dir = os.path.join('media', 'uploads')
                os.makedirs(upload_dir, exist_ok=True)
                filepath = os.path.join(upload_dir, file_obj.name)
                
                with open(filepath, 'wb+') as destination:
                    for chunk in file_obj.chunks():
                        destination.write(chunk)
                
                chunks = IngestionEngine.process_pdf(filepath, final_title)
                if not chunks:
                    if os.path.exists(filepath): os.remove(filepath) 
                    return Response({"error": "Failed to extract text from PDF."}, status=status.HTTP_400_BAD_REQUEST)

            if chunks:
                doc = Document.objects.create(
                    workspace=workspace,
                    title=final_title,
                    type='video' if upload_type == 'youtube' else 'pdf',
                    source_url=source_url
                )
                VectorStoreService.index_document_chunks(workspace_id, doc.id, chunks)
                
                threading.Thread(target=background_auto_generate, args=(workspace.id, doc.id, final_title)).start()
                return Response({"message": f"Successfully indexed {len(chunks)} chunks! Auto-generating artifacts in background..."}, status=status.HTTP_201_CREATED)
            else:
                return Response({"error": "Failed to extract data."}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)