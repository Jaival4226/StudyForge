# core/urls.py

from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    # Route all API traffic to our workspaces app
    path('api/', include('workspaces.urls')), 
]