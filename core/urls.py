from django.contrib import admin
from django.urls import path, include

# 1. ADD THIS IMPORT AT THE TOP
from rest_framework.authtoken.views import obtain_auth_token 

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Your existing workspaces API route
    path('api/', include('workspaces.urls')), 
    
    # 2. ADD THIS NEW LINE FOR THE LOGIN ENDPOINT
    path('api/login/', obtain_auth_token, name='api_token_auth'),
]