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
    class Meta:
        model = Workspace
        # FIX: Removed 'name' because it doesn't exist in your database model!
        fields = ['id', 'owner', 'collaborators'] 
        read_only_fields = ['owner']