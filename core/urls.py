from django.contrib import admin
from django.urls import path, include
from rest_framework.authtoken.views import obtain_auth_token
from workspaces.views import register_user
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # This MUST be here to load the React app from your templates folder!
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
    
    path('admin/', admin.site.urls),
    path('api/login/', obtain_auth_token, name='api_token_auth'),
    path('api/register/', register_user, name='register_user'),
    path('api/', include('workspaces.urls')), 
    path('admin/', admin.site.urls),
    path('api/', include('workspaces.urls')),
]
# This explicitly tells Django to serve the /media/ folder in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)