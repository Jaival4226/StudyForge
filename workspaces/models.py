# workspaces/models.py

from django.db import models
from django.contrib.auth.models import User

class Workspace(models.Model):
    """
    A logical container holding all documents, vector references, 
    and AI-generated learning artifacts for a specific study topic.
    """
    title = models.CharField(max_length=255)
    
    # UPDATED: Renamed from 'user' to 'owner' to clarify permissions
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_workspaces')
    
    # NEW: The list of other users who have access to this workspace
    collaborators = models.ManyToManyField(User, related_name='shared_workspaces', blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class Document(models.Model):
    """
    Represents raw source files or external media links.
    The primary text contents are chunked and offloaded to the vector database,
    while this table retains metadata and source mapping.
    """
    DOCUMENT_TYPES = [
        ('pdf', 'PDF Document'),
        ('video', 'YouTube Video'),
    ]

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='documents')
    type = models.CharField(max_length=10, choices=DOCUMENT_TYPES)
    title = models.CharField(max_length=255)
    
    # Context-specific fields (null/blank allowed depending on the document type)
    source_url = models.URLField(max_length=500, blank=True, null=True)
    file_upload = models.FileField(upload_to='workspace_docs/', blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.get_type_display()}] {self.title}"


class Artifact(models.Model):
    """
    Stores structured AI-generated learning data (such as JSON arrays of 
    flashcards, terms, definitions, or matching games) generated from workspace content.
    """
    ARTIFACT_TYPES = [
        ('quiz', 'Quiz'),
        ('flashcard', 'Flashcard Set'),
    ]

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='artifacts')
    type = models.CharField(max_length=15, choices=ARTIFACT_TYPES)
    data_json = models.JSONField()  # Enforces structural JSON directly inside SQLite
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.get_type_display()}] - {self.workspace.title}"