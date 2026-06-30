# workspaces/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WorkspaceViewSet, DocumentViewSet, ArtifactViewSet

# The router automatically generates the /api/workspaces/ etc. routes
router = DefaultRouter()
router.register(r'workspaces', WorkspaceViewSet)
router.register(r'documents', DocumentViewSet)
router.register(r'artifacts', ArtifactViewSet)

urlpatterns = [
    path('', include(router.urls)),
]