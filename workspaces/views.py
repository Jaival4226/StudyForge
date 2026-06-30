# workspaces/views.py

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Workspace, Document, Artifact
from .serializers import WorkspaceSerializer, DocumentSerializer, ArtifactSerializer

from .ingestion import IngestionEngine
from .vector_store import VectorStoreService
from .ai_engine import AIEngine

class WorkspaceViewSet(viewsets.ModelViewSet):
    queryset = Workspace.objects.all().order_by('-created_at')
    serializer_class = WorkspaceSerializer

    @action(detail=True, methods=['post'])
    def chat(self, request, pk=None):
        """
        POST /api/workspaces/<id>/chat/
        Expects JSON payload: {"query": "What is the main topic?"}
        """
        user_query = request.data.get('query')
        if not user_query:
            return Response({"error": "Please provide a 'query' in the JSON body."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            response_data = AIEngine.chat_with_workspace(workspace_id=pk, user_query=user_query)
            return Response(response_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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