# workspaces/views.py

import os
import json
import urllib.request
import traceback
import re
from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.authtoken.models import Token

from .models import Workspace, Document, Artifact
from .serializers import WorkspaceSerializer, DocumentSerializer, ArtifactSerializer
from .ingestion import IngestionEngine
from .vector_store import VectorStoreService
from .ai_engine import AIEngine
from .mongo_service import ChatMemoryService

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
        """Allows the owner to delete a document from the workspace and purges its vectors."""
        workspace = self.get_object()
        
        # Security: Only the owner can delete files
        if workspace.owner != request.user:
            return Response({'error': 'Only the owner can delete files.'}, status=status.HTTP_403_FORBIDDEN)
            
        doc_id = request.data.get('document_id')
        try:
            doc = Document.objects.get(id=doc_id, workspace=workspace)
            
            # 1. NEW: Purge the ghost vectors from ChromaDB FIRST!
            VectorStoreService.delete_document_chunks(workspace.id, doc.id)
            
            # 2. Delete the SQLite record and the physical file
            doc.delete()
            
            return Response({'message': 'Document and vectors deleted successfully'}, status=status.HTTP_200_OK)
        except Document.DoesNotExist:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)

class ArtifactViewSet(viewsets.ModelViewSet):
    queryset = Artifact.objects.all().order_by('-created_at')
    serializer_class = ArtifactSerializer

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
        except Exception as e:
            print(f"❌ Error processing Document {document.id}: {str(e)}")

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
            chunks = []
            final_title = ""
            source_url = ""

            # ROUTE A: YOUTUBE VIDEO
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

                # Attempt extraction FIRST
                chunks = IngestionEngine.process_youtube(youtube_url)
                if not chunks:
                    return Response({"error": "Failed to extract transcript from YouTube video."}, status=status.HTTP_400_BAD_REQUEST)

            # ROUTE B: LOCAL PDF FILE
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
                
                # Attempt extraction FIRST and pass the title to the engine
                chunks = IngestionEngine.process_pdf(filepath, final_title)
                
                if not chunks:
                    if os.path.exists(filepath):
                        os.remove(filepath) # Clean up the broken file
                    return Response({"error": "Failed to extract text from PDF."}, status=status.HTTP_400_BAD_REQUEST)

            # THE FIX: Only create the database record if chunks exist!
            if chunks:
                doc = Document.objects.create(
                    workspace=workspace,
                    title=final_title,
                    type='video' if upload_type == 'youtube' else 'pdf',
                    source_url=source_url
                )
                
                VectorStoreService.index_document_chunks(
                    workspace_id=workspace_id,
                    document_id=doc.id,
                    chunks=chunks
                )
                return Response({"message": f"Successfully indexed {len(chunks)} chunks!"}, status=status.HTTP_201_CREATED)
            else:
                return Response({"error": "Failed to extract data."}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)