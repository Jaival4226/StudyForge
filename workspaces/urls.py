# workspaces/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WorkspaceViewSet, DocumentViewSet, ArtifactViewSet
from django.urls import path
from .views import FileUploadView
from workspaces.views import register_user

# The router automatically generates the /api/workspaces/ etc. routes
router = DefaultRouter()
router.register(r'workspaces', WorkspaceViewSet, basename='workspace')
router.register(r'documents', DocumentViewSet)
router.register(r'artifacts', ArtifactViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('upload/', FileUploadView.as_view(), name='file-upload'),
    path('api/register/', register_user, name='register_user'),
]