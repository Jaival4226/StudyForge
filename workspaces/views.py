# workspaces/views.py
import os
from django.contrib.auth.models import User
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from .models import Workspace, Document, Artifact
from .serializers import WorkspaceSerializer, DocumentSerializer, ArtifactSerializer
from .ingestion import IngestionEngine
from .vector_store import VectorStoreService
from .ai_engine import AIEngine
from .mongo_service import ChatMemoryService
from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.authtoken.models import Token
from .models import Workspace
from .models import Document

@api_view(['POST'])
@permission_classes([AllowAny]) # Bypasses the bouncer so strangers can sign up!
def register_user(request):
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response({'error': 'Username and password required.'}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username already taken.'}, status=status.HTTP_400_BAD_REQUEST)

    # 1. Create the new user
    user = User.objects.create_user(username=username, password=password)
    
    # 2. Auto-generate their very first private workspace!
    Workspace.objects.create(name=f"{username}'s Workspace", owner=user)

    # 3. Log them in
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key}, status=status.HTTP_201_CREATED)

class WorkspaceViewSet(viewsets.ModelViewSet):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Security check: Only return workspaces where the logged-in user 
        is either the 'owner' OR is in the 'collaborators' list.
        """
        user = self.request.user
        return Workspace.objects.filter(Q(owner=user) | Q(collaborators=user)).distinct()

    def perform_create(self, serializer):
        """
        When a new workspace is created, automatically assign the 
        currently logged-in user as the owner.
        """
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=['post'])
    def add_collaborator(self, request, pk=None):
        """
        Custom endpoint to invite another user to this workspace.
        """
        workspace = self.get_object()
        username_to_add = request.data.get('username')
        
        # Security: Only the owner can invite new people
        if workspace.owner != request.user:
            return Response({'error': 'Only the workspace owner can add collaborators.'}, status=status.HTTP_403_FORBIDDEN)
            
        try:
            # Find the user in the database
            user_to_add = User.objects.get(username=username_to_add)
            
            # Prevent adding yourself as a collaborator
            if user_to_add == workspace.owner:
                return Response({'error': 'You are already the owner of this workspace.'}, status=status.HTTP_400_BAD_REQUEST)

            # Add them to the workspace
            workspace.collaborators.add(user_to_add)
            return Response({'message': f'Successfully added {username_to_add} to the workspace!'}, status=status.HTTP_200_OK)
            
        except User.DoesNotExist:
            return Response({'error': 'User not found. Check the username and try again.'}, status=status.HTTP_404_NOT_FOUND)
    @action(detail=True, methods=['post'])
    def chat(self, request, pk=None):
        """
        Chat with the workspace AI. 
        Because we use self.get_object(), the Bouncer automatically allows collaborators!
        """
        workspace = self.get_object() 
        
        # Grab the message from React
        user_message = request.data.get('message') or request.data.get('query') or request.data.get('prompt')
        if not user_message:
            return Response({"error": "Message is required"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # FIXED: Using your exact function name AND passing the user_id for MongoDB memory!
            ai_response_dict = AIEngine.chat_with_workspace(
                workspace_id=workspace.id, 
                user_query=user_message,
                user_id=request.user.id  # <-- This links the chat history to Krish!
            )
            
            # Your AI Engine returns a dictionary with 'answer' and 'sources'
            return Response(ai_response_dict, status=status.HTTP_200_OK)
            
        except Exception as e:
            import traceback
            traceback.print_exc() # Prints the exact error in your terminal if it fails
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    @action(detail=True, methods=['get'])
    def list_collaborators(self, request, pk=None):
        """
        Returns a list of all usernames currently collaborating on this workspace.
        """
        workspace = self.get_object()
        # Grab just the usernames of everyone in the junction table
        collaborators = workspace.collaborators.all().values_list('username', flat=True)
        return Response({"collaborators": list(collaborators)}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def remove_collaborator(self, request, pk=None):
        """
        Allows the owner to kick a user out of the workspace.
        """
        workspace = self.get_object()
        username_to_remove = request.data.get('username')
        
        # Security: Only the owner can remove people
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
        """
        Returns the entire group chat history for this workspace.
        """
        workspace = self.get_object()
        mongo_service = ChatMemoryService()
        
        raw_history = mongo_service.get_chat_history(workspace_id=workspace.id)
        
        # Clean it up into a simple list for React
        formatted_history = [{'role': msg['role'], 'text': msg['text']} for msg in raw_history]
        
        return Response({'history': formatted_history}, status=status.HTTP_200_OK)
    @action(detail=True, methods=['get'])
    def list_documents(self, request, pk=None):
        """Returns a list of all documents ingested into this workspace."""
        workspace = self.get_object()
        docs = Document.objects.filter(workspace=workspace)
        
        # Safely grab the file name or title
        doc_list = []
        for doc in docs:
            name = getattr(doc, 'name', getattr(doc, 'title', f"File #{doc.id}"))
            doc_list.append({"id": doc.id, "name": name})
            
        return Response({"documents": doc_list}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def delete_document(self, request, pk=None):
        """Allows the owner to delete a document from the workspace."""
        workspace = self.get_object()
        
        # Security: Only the owner can delete files
        if workspace.owner != request.user:
            return Response({'error': 'Only the owner can delete files.'}, status=status.HTTP_403_FORBIDDEN)
            
        doc_id = request.data.get('document_id')
        try:
            doc = Document.objects.get(id=doc_id, workspace=workspace)
            doc.delete()
            # Note: You may also need to delete the vectors from ChromaDB here depending on your architecture!
            return Response({'message': 'Document deleted successfully'}, status=status.HTTP_200_OK)
        except Document.DoesNotExist:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)

class ArtifactViewSet(viewsets.ModelViewSet):
    queryset = Artifact.objects.all().order_by('-created_at')
    serializer_class = ArtifactSerializer

class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all().order_by('-created_at')
    serializer_class = DocumentSerializer

    def perform_create(self, serializer):
        # Fallback: If workspace isn't in validated_data, extract it directly from request
        if 'workspace' not in serializer.validated_data:
            workspace_id = self.request.data.get('workspace')
            if workspace_id:
                try:
                    workspace = Workspace.objects.get(id=workspace_id)
                    serializer.validated_data['workspace'] = workspace
                except Workspace.DoesNotExist:
                    pass

        # 1. Save to SQLite to generate the Document ID and save the physical file
        document = serializer.save()
        workspace_id = document.workspace.id

        try:
            chunks = []
            
            # 2. Route the extraction based on the document type
            if document.type == 'pdf' and document.file_upload:
                chunks = IngestionEngine.process_pdf(document.file_upload.path)
                
            elif document.type == 'video' and document.source_url:
                chunks = IngestionEngine.process_youtube(document.source_url)

            # 3. If extraction was successful, vectorize and store in ChromaDB
            if chunks:
                VectorStoreService.index_document_chunks(
                    workspace_id=workspace_id,
                    document_id=document.id,
                    chunks=chunks
                )
                print(f"✅ Successfully indexed {len(chunks)} chunks for Document {document.id}")
            else:
                print(f"⚠️ No text could be extracted from Document {document.id}")

        except Exception as e:
            print(f"❌ Error processing Document {document.id}: {str(e)}")
class FileUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        # 1. Grab the metadata sent from React
        upload_type = request.data.get('type', 'file')
        workspace_id = request.data.get('workspace_id')

        if not workspace_id:
            return Response({"error": "Workspace ID is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            workspace = Workspace.objects.get(id=workspace_id)
            chunks = []
            doc = None

            # 2. ROUTE A: YOUTUBE VIDEO
            if upload_type == 'youtube':
                youtube_url = request.data.get('youtube_url')
                if not youtube_url:
                    return Response({"error": "No YouTube URL provided"}, status=status.HTTP_400_BAD_REQUEST)
                
                # Create a database record
                doc = Document.objects.create(
                    workspace=workspace,
                    title=f"YouTube Video: {youtube_url[-11:]}",
                    type='video',
                    source_url=youtube_url
                )
                
                # Trigger the magic ingestion script
                chunks = IngestionEngine.process_youtube(youtube_url)

            # 3. ROUTE B: LOCAL PDF FILE
            elif upload_type == 'file':
                file_obj = request.FILES.get('file')
                if not file_obj:
                    return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)
                
                # NEW: Check if the user passed a custom title
                custom_title = request.data.get('title', '').strip()
                final_title = custom_title if custom_title else file_obj.name
                
                # Save the file temporarily so the PDF parser can read it
                upload_dir = os.path.join('media', 'uploads')
                os.makedirs(upload_dir, exist_ok=True)
                filepath = os.path.join(upload_dir, file_obj.name)
                
                with open(filepath, 'wb+') as destination:
                    for chunk in file_obj.chunks():
                        destination.write(chunk)
                
                # Create a database record using the smart title logic
                doc = Document.objects.create(
                    workspace=workspace,
                    title=final_title, # <--- UPDATED THIS LINE
                    type='pdf'
                )

                # Trigger the magic ingestion script
                chunks = IngestionEngine.process_pdf(filepath)

            # 4. STORE IN CHROMADB
            if chunks and doc:
                VectorStoreService.index_document_chunks(
                    workspace_id=workspace_id,
                    document_id=doc.id,
                    chunks=chunks
                )
                return Response({"message": f"Successfully indexed {len(chunks)} chunks!"}, status=status.HTTP_201_CREATED)
            else:
                return Response({"error": "Failed to extract text from the source."}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
