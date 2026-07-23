// src/InviteCollaborator.jsx (or wherever your templates folder is)
import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';

export default function InviteCollaborator({ workspaceId, onInviteSuccess }) {
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsLoading(true);
    setStatus('');

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`http://127.0.0.1:8000/api/workspaces/${workspaceId}/add_collaborator/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify({ username: username })
      });

      const data = await response.json();

      if (response.ok) {
        setStatus(`✅ ${data.message}`);
        setUsername('');
        
        // NEW: Tell the parent (App.jsx) that the invite was successful!
        if (onInviteSuccess) {
          onInviteSuccess();
        }
      } else {
        setStatus(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setStatus('❌ Network error. Could not connect to backend.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl shadow-md border border-gray-700 p-5 w-full">
      <div className="flex items-center mb-3 text-sm font-semibold text-gray-200">
        <UserPlus className="w-4 h-4 mr-2 text-blue-400" />
        Invite to Workspace
      </div>
      <form onSubmit={handleInvite} className="flex space-x-2">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username (e.g., krish)..."
          className="flex-1 bg-gray-900 text-gray-100 placeholder-gray-500 px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500 text-sm"
        />
        <button
          type="submit"
          disabled={isLoading || !username.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
        >
          {isLoading ? '...' : 'Invite'}
        </button>
      </form>
      {status && <p className="mt-3 text-xs font-medium text-gray-400">{status}</p>}
    </div>
  );
}