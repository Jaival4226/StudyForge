// src/ManageDocuments.jsx
import React, { useState, useEffect } from 'react';
import { FileText, Trash2 } from 'lucide-react';

export default function ManageDocuments({ workspaceId, refreshKey }) {
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`http://127.0.0.1:8000/api/workspaces/${workspaceId}/list_documents/`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      const data = await response.json();
      
      if (response.ok) {
        setDocuments(data.documents);
      }
    } catch (err) {
      setError('Failed to load documents.');
    }
  };

  const handleDelete = async (documentId) => {
    if (isDeleting) return; // Prevent double clicks
    setIsDeleting(true);
    
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`http://127.0.0.1:8000/api/workspaces/${workspaceId}/delete_document/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify({ document_id: documentId })
      });
      
      if (response.ok) {
        // Refresh the list immediately after a successful deletion
        fetchDocuments();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete document. Are you the owner?');
      }
    } catch (err) {
      setError('Network error.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Run whenever the workspace changes, or if App.jsx triggers a refresh
  useEffect(() => {
    if (workspaceId) {
      fetchDocuments();
    }
  }, [workspaceId, refreshKey]);

  return (
    <div className="bg-gray-800 rounded-xl shadow-md border border-gray-700 p-5 w-full mt-4">
      <div className="flex items-center mb-4 text-sm font-semibold text-gray-200">
        <FileText className="w-4 h-4 mr-2 text-green-400" />
        Ingested Documents
      </div>
      
      {error && <p className="mb-3 text-xs font-medium text-red-400">{error}</p>}
      
      {documents.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No documents ingested yet.</p>
      ) : (
        <ul className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-700">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between bg-gray-900 px-3 py-2 rounded-lg border border-gray-700">
              <span className="text-sm text-gray-300 truncate pr-2" title={doc.name}>
                {doc.name}
              </span>
              <button 
                onClick={() => handleDelete(doc.id)}
                disabled={isDeleting}
                className="text-gray-500 hover:text-red-400 transition-colors shrink-0 disabled:opacity-50"
                title="Delete Document"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}