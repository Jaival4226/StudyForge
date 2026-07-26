# workspaces/serializers.py

from rest_framework import serializers
from .models import Workspace, Document, Artifact

class ArtifactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Artifact
        fields = '__all__'

class DocumentSerializer(serializers.ModelSerializer):
    # Ensure workspace is NOT marked as read_only=True
    workspace = serializers.PrimaryKeyRelatedField(queryset=Workspace.objects.all())

    class Meta:
        model = Document
        fields = ['id', 'workspace', 'title', 'type', 'source_url', 'file_upload', 'created_at']

class WorkspaceSerializer(serializers.ModelSerializer):
    # Create two read-only fields that calculate on the fly
    is_owner = serializers.SerializerMethodField()
    owner_username = serializers.CharField(source='owner.username', read_only=True)

    class Meta:
        model = Workspace
        fields = '__all__' # This safely grabs all your existing fields plus the two new ones above

    def get_is_owner(self, obj):
        request = self.context.get('request')
        # Check if the person asking the API is the actual owner
        if request and hasattr(request, 'user'):
            return obj.owner == request.user
        return False