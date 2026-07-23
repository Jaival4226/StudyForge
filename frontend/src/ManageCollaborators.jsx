// src/ManageCollaborators.jsx (or wherever your templates folder is)
import React, { useState, useEffect } from 'react';
import { Users, UserMinus } from 'lucide-react';

export default function ManageCollaborators({ workspaceId, refreshKey }) {
  const [collaborators, setCollaborators] = useState([]);
  const [error, setError] = useState('');

  const fetchCollaborators = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`http://127.0.0.1:8000/api/workspaces/${workspaceId}/list_collaborators/`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      const data = await response.json();
      
      if (response.ok) {
        setCollaborators(data.collaborators);
      }
    } catch (err) {
      setError('Failed to load collaborators.');
    }
  };

  const handleRemove = async (username) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`http://127.0.0.1:8000/api/workspaces/${workspaceId}/remove_collaborator/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify({ username })
      });
      
      if (response.ok) {
        // Refresh the list immediately after kicking someone out
        fetchCollaborators();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to remove user.');
      }
    } catch (err) {
      setError('Network error.');
    }
  };

  // NEW: Added refreshKey to the dependency array. 
  // Whenever the App.jsx bumps the key up by 1, this runs again instantly!
  useEffect(() => {
    if (workspaceId) {
      fetchCollaborators();
    }
  }, [workspaceId, refreshKey]);

  return (
    <div className="bg-gray-800 rounded-xl shadow-md border border-gray-700 p-5 w-full mt-4">
      <div className="flex items-center mb-4 text-sm font-semibold text-gray-200">
        <Users className="w-4 h-4 mr-2 text-purple-400" />
        Active Collaborators
      </div>
      
      {error && <p className="mb-3 text-xs font-medium text-red-400">{error}</p>}
      
      {collaborators.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No collaborators yet.</p>
      ) : (
        <ul className="space-y-2">
          {collaborators.map((username) => (
            <li key={username} className="flex items-center justify-between bg-gray-900 px-3 py-2 rounded-lg border border-gray-700">
              <span className="text-sm text-gray-300">@{username}</span>
              <button 
                onClick={() => handleRemove(username)}
                className="text-gray-500 hover:text-red-400 transition-colors"
                title="Remove Access"
              >
                <UserMinus className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}