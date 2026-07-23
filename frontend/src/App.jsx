// src/App.jsx

import React, { useState, useRef, useEffect } from 'react';
import YouTube from 'react-youtube';
import { Send, Video, MessageSquare, LogOut, FolderSync } from 'lucide-react';
import Login from './Login';
import UploadZone from './UploadZone';
import InviteCollaborator from './InviteCollaborator';
import ManageCollaborators from './ManageCollaborators';
import ManageDocuments from './ManageDocuments';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('auth_token'));
  const [refreshKey, setRefreshKey] = useState(0);
  
  // --- NEW WORKSPACE MANAGEMENT STATE ---
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState('');
  
  const [activeVideoId, setActiveVideoId] = useState('BJ-VvGyQxho');
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const [pendingSeek, setPendingSeek] = useState(null);
  const playerRef = useRef(null);

  // --- NEW: FETCH AVAILABLE WORKSPACES ---
  useEffect(() => {
    if (!token) return;
    const loadWorkspaces = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/workspaces/', {
          headers: { 'Authorization': `Token ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
          setWorkspaces(data);
          // Auto-select the first workspace if the user has one and none is selected
          if (data.length > 0 && !workspaceId) {
            setWorkspaceId(data[0].id.toString());
          }
        }
      } catch (err) {
        console.error("Failed to load workspaces", err);
      }
    };
    loadWorkspaces();
  }, [token, refreshKey]); // reload list if refreshKey changes

  // --- NEW: FETCH CHAT HISTORY ON WORKSPACE CHANGE ---
  useEffect(() => {
    if (!token || !workspaceId) return;
    const fetchChatHistory = async () => {
      setChatHistory([]); // Clear the screen while loading
      try {
        const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/history/`, {
          headers: { 'Authorization': `Token ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
          setChatHistory(data.history);
        }
      } catch (err) {
        console.error("Failed to load history", err);
      }
    };
    fetchChatHistory();
  }, [workspaceId, token]);

  const timestampToSeconds = (timestamp) => {
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    return 0;
  };

  const handleTimestampClick = (locationStr) => {
    const seconds = timestampToSeconds(locationStr);
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, true);
      playerRef.current.playVideo();
    }
  };

  const renderMessageWithSmartTimestamps = (text) => {
    const regex = /\[([a-zA-Z0-9_-]{11})\|([0-9:]+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const videoId = match[1];
      const timestamp = match[2];
      parts.push(
        <button
          key={match.index}
          onClick={() => {
            if (videoId !== activeVideoId) {
              setActiveVideoId(videoId);
              setPendingSeek(timestampToSeconds(timestamp));
            } else {
              handleTimestampClick(timestamp);
            }
          }}
          className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded text-xs mx-1 font-mono transition-colors shadow-sm cursor-pointer"
        >
          <Video className="w-3 h-3 mr-1" />
          {timestamp}
        </button>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    return parts;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!query.trim() || !workspaceId) return;

    const userMsg = { role: 'user', text: query };
    setChatHistory(prev => [...prev, userMsg]);
    setLoading(true);
    setQuery('');

    try {
      const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/chat/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify({ query: query })
      });
      const data = await response.json();
      if (response.ok) {
        setChatHistory(prev => [...prev, { role: 'ai', text: data.answer }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'ai', text: `❌ Error: ${data.error || 'Unauthorized'}` }]);
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'ai', text: "❌ Failed to connect to backend." }]);
    } finally {
      setLoading(false);
    }
  };

  const onPlayerReady = (event) => {
    playerRef.current = event.target;
    if (pendingSeek !== null) {
      playerRef.current.seekTo(pendingSeek, true);
      playerRef.current.playVideo();
      setPendingSeek(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setChatHistory([]);
    setWorkspaceId('');
  };

  if (!token) return <Login setToken={setToken} />;

  return (
    <div className="w-full h-screen bg-gray-900 text-gray-100 flex flex-col font-sans">
      <header className="w-full h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6 shadow-md shrink-0">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-lg font-bold text-white tracking-wider">AC</div>
          <h1 className="text-xl font-bold tracking-tight text-white">Academic AI Workspace <span className="text-xs text-blue-400 font-mono">v3.0</span></h1>
        </div>
        
        {/* --- THE NEW WORKSPACE SWITCHER --- */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 bg-gray-900 px-3 py-1.5 rounded-md border border-gray-700">
            <FolderSync className="w-4 h-4 text-purple-400" />
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="bg-transparent text-sm font-semibold text-gray-200 focus:outline-none cursor-pointer"
            >
              {workspaces.length === 0 && <option value="">No Workspaces Available</option>}
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id} className="bg-gray-800">
                  {ws.name || `Workspace ${ws.id}`}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-1 text-gray-400 hover:text-red-400 transition-colors"
            title="Log out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full flex overflow-hidden">
        {/* LEFT COLUMN */}
        <section className="w-1/2 h-full bg-gray-950 border-r border-gray-800 flex flex-col items-center p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700">
          
          <div className="w-full mb-4 flex items-center space-x-2 bg-gray-900 px-4 py-2 rounded-xl border border-gray-800 shadow-sm mt-auto shrink-0">
            <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">Active Video ID:</span>
            <input
              type="text"
              value={activeVideoId}
              onChange={(e) => setActiveVideoId(e.target.value)}
              className="flex-1 bg-transparent text-blue-400 font-mono text-sm focus:outline-none"
            />
          </div>

          <div className="w-full aspect-video bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-2xl flex items-center justify-center shrink-0">
            <YouTube
              videoId={activeVideoId}
              opts={{ width: '100%', height: '100%', playerVars: { autoplay: 0 } }}
              onReady={onPlayerReady}
              className="w-full h-full aspect-video"
            />
          </div>

          <div className="mt-4 mb-6 text-center max-w-md shrink-0">
            <h3 className="text-sm font-semibold text-gray-400 flex items-center justify-center">
              <Video className="w-4 h-4 text-blue-500 mr-2" /> Auto-Switching Video Sync Active
            </h3>
          </div>

          <div className="w-full max-w-md border-t border-gray-800 pt-6 pb-2 shrink-0">
            {workspaceId ? (
               <UploadZone workspaceId={workspaceId} />
            ) : (
               <p className="text-xs text-gray-500 text-center">Select or create a workspace to upload files.</p>
            )}
          </div>

          <div className="w-full max-w-md space-y-4 shrink-0 pb-10">
            {workspaceId && (
              <>
                <InviteCollaborator 
                  workspaceId={workspaceId} 
                  onInviteSuccess={() => setRefreshKey(prev => prev + 1)} 
                />
                <ManageCollaborators 
                  workspaceId={workspaceId} 
                  refreshKey={refreshKey} 
                />
              </>
            )}
          </div>
          {/* --- INTEGRATED UPLOAD ZONE --- */}
          <div className="w-full max-w-md border-t border-gray-800 pt-6 pb-2 shrink-0">
            {workspaceId ? (
               <UploadZone workspaceId={workspaceId} />
            ) : (
               <p className="text-xs text-gray-500 text-center">Select or create a workspace to upload files.</p>
            )}
          </div>

          {/* --- MANAGEMENT ZONES (Docs & Collaborators) --- */}
          <div className="w-full max-w-md space-y-4 shrink-0 pb-10">
            {workspaceId && (
              <>
                {/* NEW: Document Management Panel */}
                <ManageDocuments 
                  workspaceId={workspaceId} 
                  refreshKey={refreshKey} 
                />
                
                <InviteCollaborator 
                  workspaceId={workspaceId} 
                  onInviteSuccess={() => setRefreshKey(prev => prev + 1)} 
                />
                <ManageCollaborators 
                  workspaceId={workspaceId} 
                  refreshKey={refreshKey} 
                />
              </>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <section className="w-1/2 h-full flex flex-col bg-gray-900">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {chatHistory.length === 0 && !loading ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 space-y-3">
                <MessageSquare className="w-12 h-12 text-gray-700" />
                <p className="text-sm">Workspace chat ready. Ask anything about your ingested knowledge base!</p>
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-md text-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700'}`}>
                    {msg.role === 'user' ? msg.text : renderMessageWithSmartTimestamps(msg.text)}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-bl-none px-4 py-3 text-sm text-gray-400 animate-pulse">
                  AI Brain is processing context from all videos...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-gray-800 border-t border-gray-700 flex space-x-3 items-center shrink-0">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your ingested knowledge base..."
              disabled={!workspaceId}
              className="flex-1 bg-gray-900 text-gray-100 placeholder-gray-500 px-4 py-3 rounded-xl border border-gray-700 focus:outline-none focus:border-blue-500 transition-colors text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !workspaceId}
              className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl cursor-pointer disabled:opacity-50 transition-colors shadow-lg"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}