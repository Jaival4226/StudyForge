from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WorkspaceViewSet, DocumentViewSet, ArtifactViewSet, FileUploadView

router = DefaultRouter()
router.register(r'workspaces', WorkspaceViewSet, basename='workspace')
router.register(r'documents', DocumentViewSet)
router.register(r'artifacts', ArtifactViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('upload/', FileUploadView.as_view(), name='file-upload'),
]