// src/UploadZone.jsx
import React, { useState } from 'react';
import { Video, FileText } from 'lucide-react';

export default function UploadZone({ workspaceId, onUploadSuccess }) { 
  const [inputType, setInputType] = useState('youtube'); 
  const [file, setFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  
  // State for the optional custom title
  const [customTitle, setCustomTitle] = useState(''); 
  
  const [statusMessage, setStatusMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (inputType === 'file' && !file) {
      setStatusMessage('Please select a PDF file first.');
      return;
    }
    if (inputType === 'youtube' && !youtubeUrl) {
      setStatusMessage('Please paste a YouTube URL first.');
      return;
    }

    setIsUploading(true);
    setStatusMessage('Extracting and indexing data to ChromaDB...');

    const formData = new FormData();
    formData.append('type', inputType);
    formData.append('workspace_id', workspaceId); 
    
    // Attach the custom title if the user typed one
    if (customTitle.trim() !== '') {
        formData.append('title', customTitle);
    }
    
    if (inputType === 'file') {
      formData.append('file', file);
    } else {
      formData.append('youtube_url', youtubeUrl);
    }

    try {
      const token = localStorage.getItem('auth_token');
      // FIXED: Using localhost to match your other API calls and avoid CORS/Network issues
      const response = await fetch('http://localhost:8000/api/upload/', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`
        },
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        // Trigger the automatic UI refresh!
        if (onUploadSuccess) {
          onUploadSuccess(); 
        }
        setStatusMessage(`✅ Success: ${data.message}`);
        setFile(null);
        setYoutubeUrl('');
        setCustomTitle(''); // Reset title on success
      } else {
        setStatusMessage(`❌ Error: ${data.error || 'Upload failed'}`);
      }
    } catch (error) {
      setStatusMessage('❌ Network error. Could not connect to backend.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl shadow-md border border-gray-700 p-5 w-full">
      
      {/* Toggle Tabs */}
      <div className="flex space-x-2 mb-4 bg-gray-900 p-1 rounded-lg">
        <button 
          onClick={() => setInputType('youtube')}
          className={`flex-1 flex items-center justify-center py-2 px-3 rounded-md text-sm font-medium transition-colors ${inputType === 'youtube' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
        >
          <Video className="w-4 h-4 mr-2" /> YouTube
        </button>
        <button 
          onClick={() => setInputType('file')}
          className={`flex-1 flex items-center justify-center py-2 px-3 rounded-md text-sm font-medium transition-colors ${inputType === 'file' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
        >
          <FileText className="w-4 h-4 mr-2" /> Local PDF
        </button>
      </div>

      <form onSubmit={handleUpload} className="space-y-4">
        {inputType === 'youtube' ? (
          <div>
            <input 
              type="url" 
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="w-full bg-gray-900 text-gray-100 placeholder-gray-500 px-4 py-3 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500 transition-colors text-sm"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Optional Title Input for PDFs */}
            <input 
              type="text" 
              placeholder="Document Title (Optional - defaults to filename)"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full bg-gray-900 text-gray-100 placeholder-gray-500 px-4 py-2.5 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500 transition-colors text-sm"
            />
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg p-6 bg-gray-900 hover:bg-gray-800 transition cursor-pointer">
              <input 
                type="file" 
                accept=".pdf"
                onChange={(e) => setFile(e.target.files[0])} 
                className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
              />
            </div>
          </div>
        )}
        
        <button
          type="submit"
          disabled={isUploading}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg focus:outline-none disabled:opacity-50 transition-colors text-sm tracking-wide"
        >
          {isUploading ? 'Extracting & Indexing...' : 'Add to Workspace'}
        </button>
      </form>
      
      {statusMessage && (
        <p className={`mt-3 text-xs text-center font-medium ${statusMessage.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>
          {statusMessage}
        </p>
      )}
    </div>
  );
}