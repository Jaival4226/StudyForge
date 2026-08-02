# workspaces/models.py

from django.db import models
from django.contrib.auth.models import User

class Workspace(models.Model):
    title = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_workspaces')
    collaborators = models.ManyToManyField(User, related_name='shared_workspaces', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

class Document(models.Model):
    DOCUMENT_TYPES = [('pdf', 'PDF Document'), ('video', 'YouTube Video')]
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='documents')
    type = models.CharField(max_length=10, choices=DOCUMENT_TYPES)
    title = models.CharField(max_length=255)
    source_url = models.URLField(max_length=500, blank=True, null=True)
    file_upload = models.FileField(upload_to='workspace_docs/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.get_type_display()}] {self.title}"

class Artifact(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='artifacts')
    title = models.CharField(max_length=255)
    content = models.TextField()
    artifact_type = models.CharField(max_length=50, default='markdown') 
    progress_state = models.JSONField(default=dict, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

# --- NEW: Per-User Spaced Repetition Tracking ---
class ConceptMastery(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='mastery_records')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='mastery_records')
    tag = models.CharField(max_length=255)
    correct_count = models.IntegerField(default=0)
    incorrect_count = models.IntegerField(default=0)
    last_reviewed = models.DateTimeField(auto_now=True)
    next_review_due = models.DateTimeField()

    class Meta:
        unique_together = ('workspace', 'user', 'tag')

    def __str__(self):
        return f"{self.user.username} - {self.tag}"