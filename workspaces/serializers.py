# workspaces/serializers.py

from rest_framework import serializers
from .models import Workspace, Document, Artifact

class ArtifactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Artifact
        fields = ['id', 'type', 'data_json', 'created_at']

class DocumentSerializer(serializers.ModelSerializer):
    # Ensure workspace is NOT marked as read_only=True
    workspace = serializers.PrimaryKeyRelatedField(queryset=Workspace.objects.all())

    class Meta:
        model = Document
        fields = ['id', 'workspace', 'title', 'type', 'source_url', 'file_upload', 'created_at']

class WorkspaceSerializer(serializers.ModelSerializer):
    # Nested serializers to return all related docs and artifacts when fetching a workspace
    documents = DocumentSerializer(many=True, read_only=True)
    artifacts = ArtifactSerializer(many=True, read_only=True)

    class Meta:
        model = Workspace
        fields = ['id', 'title', 'user', 'documents', 'artifacts', 'created_at']