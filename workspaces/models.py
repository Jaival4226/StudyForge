# workspaces/models.py

from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class Workspace(models.Model):
    title = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="owned_workspaces")
    collaborators = models.ManyToManyField(User, blank=True, related_name="shared_workspaces")
    created_at = models.DateTimeField(auto_now_add=True)

class Document(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="documents")
    type = models.CharField(max_length=10, choices=[("pdf", "PDF Document"), ("video", "YouTube Video")])
    title = models.CharField(max_length=255)
    source_url = models.URLField(max_length=500, blank=True, null=True)
    file_upload = models.FileField(upload_to="workspace_docs/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Artifact(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="artifacts")
    title = models.CharField(max_length=255)
    artifact_type = models.CharField(max_length=50, default="markdown")
    content = models.TextField()
    progress_state = models.JSONField(blank=True, null=True, default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

class ConceptMastery(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="mastery_records")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="mastery_records")
    tag = models.CharField(max_length=255)
    correct_count = models.IntegerField(default=0)
    incorrect_count = models.IntegerField(default=0)
    last_reviewed = models.DateTimeField(auto_now=True)
    next_review_due = models.DateTimeField()
    
    concept_node = models.ForeignKey('ConceptNode', null=True, blank=True, on_delete=models.SET_NULL, related_name='mastery_records')

    class Meta:
        unique_together = [("workspace", "user", "tag")]  # <-- Fixed: changed {...} to [...]
# ==========================================
# CORTEX: LIVING KNOWLEDGE GRAPH MODELS
# ==========================================

class ConceptNode(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='concept_nodes')
    canonical_tag = models.CharField(max_length=255)
    label = models.CharField(max_length=255)
    summary = models.TextField()
    details = models.TextField()
    embedding_id = models.CharField(max_length=255)
    version = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ConceptEdge(models.Model):
    RELATIONSHIP_CHOICES = (
        ('prerequisite', 'Prerequisite'),
        ('builds_on', 'Builds On'),
        ('related_to', 'Related To'),
        ('contrasts_with', 'Contrasts With'),
    )
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='concept_edges')
    source_node = models.ForeignKey(ConceptNode, on_delete=models.CASCADE, related_name='outgoing_edges')
    target_node = models.ForeignKey(ConceptNode, on_delete=models.CASCADE, related_name='incoming_edges')
    relationship_type = models.CharField(max_length=50, choices=RELATIONSHIP_CHOICES)
    label = models.CharField(max_length=255)
    confidence = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

class NodeResource(models.Model):
    node = models.ForeignKey(ConceptNode, on_delete=models.CASCADE, related_name='resources')
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='node_resources')
    source_tag = models.CharField(max_length=500)
    title = models.CharField(max_length=500)
    resource_type = models.CharField(max_length=50)

class ConceptEvent(models.Model):
    EVENT_CHOICES = (
        ('node_created', 'Node Created'),
        ('resource_merged', 'Resource Merged'),
        ('detail_augmented', 'Detail Augmented'),
        ('edge_inferred', 'Edge Inferred'),
    )
    node = models.ForeignKey(ConceptNode, null=True, on_delete=models.SET_NULL, related_name='events')
    event_type = models.CharField(max_length=50, choices=EVENT_CHOICES)
    description = models.TextField()
    document = models.ForeignKey(Document, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)