// frontend/src/App.jsx

import React, { useState, useRef, useEffect } from 'react';
import YouTube from 'react-youtube';
import { Send, Video, MessageSquare, LogOut, FolderSync, FileText, Activity } from 'lucide-react';
import Login from './Login';
import UploadZone from './UploadZone';
import InviteCollaborator from './InviteCollaborator';
import ManageCollaborators from './ManageCollaborators';
import ManageDocuments from './ManageDocuments';
import ArtifactsPanel from './ArtifactsPanel';
import DailyReview from './DailyReview';
import CortexPanel from './CortexPanel';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('auth_token'));
  const [refreshKey, setRefreshKey] = useState(0);
  const [rightPanelTab, setRightPanelTab] = useState('cortex');
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [activeMedia, setActiveMedia] = useState({ type: null, src: '', pdfFile: '', loc: null, timestamp: Date.now() });
  const [pendingSeek, setPendingSeek] = useState(null);
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const playerRef = useRef(null);

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
          if (data.length > 0 && !workspaceId) setWorkspaceId(data[0].id.toString());
        }
      } catch (err) {
        console.error("Failed to load workspaces", err);
      }
    };
    loadWorkspaces();
  }, [token, refreshKey]);

  useEffect(() => {
    if (workspaceId) {
      setActiveMedia({ type: null, src: '', pdfFile: '', loc: null, timestamp: Date.now() }); 
      setPendingSeek(null);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!token || !workspaceId) return;
    const fetchChatHistory = async () => {
      setChatHistory([]); 
      try {
        const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/history/`, {
          headers: { 'Authorization': `Token ${token}` }
        });
        const data = await response.json();
        if (response.ok) setChatHistory(data.history);
      } catch (err) {
        console.error("Failed to load history", err);
      }
    };
    fetchChatHistory();
  }, [workspaceId, token]);

  const timestampToSeconds = (timestamp) => {
    if (!timestamp || !timestamp.includes(':')) return 0;
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    return 0;
  };

  const handleResourceClick = (source, loc) => {
    if (!source) return;
    const isVideo = source.length === 11 && !source.includes('.');
    
    if (isVideo) {
      const seconds = timestampToSeconds(loc);
      if (activeMedia.type === 'video' && activeMedia.src === source && playerRef.current) {
        playerRef.current.seekTo(seconds, true);
        playerRef.current.playVideo();
        setActiveMedia({ type: 'video', src: source, pdfFile: '', loc: seconds, timestamp: Date.now() }); 
      } else {
        setPendingSeek(seconds);
        setActiveMedia({ type: 'video', src: source, pdfFile: '', loc: seconds, timestamp: Date.now() });
      }
    } else if (source.toLowerCase().includes('.pdf')) {
      const cleanLoc = loc ? loc.toString() : '';
      const pageNum = cleanLoc.replace(/page/gi, '').trim() || '1';
      const pdfUrl = `http://localhost:8000/media/uploads/${source}#page=${pageNum}`;
      
      setActiveMedia({ 
        type: 'pdf', 
        pdfFile: source,
        src: pdfUrl,
        loc: `Page ${pageNum}`,
        timestamp: Date.now() 
      });
    }
  };

  const handleGraphResourceClick = (link) => {
    if (!link) return;
    if (link.startsWith('yt:') || link.startsWith('pdf:')) {
      const parts = link.split(':');
      const source = parts[1]; 
      const loc = parts.slice(2).join(':');
      handleResourceClick(source, loc);
      return;
    }
    let cleanLink = link.replace(/^\[|\]$/g, ''); 
    if (cleanLink.includes('|')) {
      const [source, loc] = cleanLink.split('|');
      handleResourceClick(source, loc);
    }
  };

  const renderMessageWithSmartTimestamps = (text) => {
    if (!text) return null;
    const regex = /\[([^|\]]+)\|([^\]]+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.substring(lastIndex, match.index));
      const source = match[1];
      const loc = match[2];
      const isVideo = source.length === 11 && !source.includes('.');

      parts.push(
        <button
          key={match.index}
          onClick={() => handleResourceClick(source, loc)}
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs mx-1 font-mono transition-colors shadow-sm cursor-pointer text-white ${isVideo ? 'bg-blue-600 hover:bg-blue-500' : 'bg-red-600 hover:bg-red-500'}`}
        >
          {isVideo ? <Video className="w-3 h-3 mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
          {loc}
        </button>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) parts.push(text.substring(lastIndex));

    return parts.map((part, index) => {
      if (typeof part === 'string') {
        const cleanText = part.replace(/\*\*/g, '');
        return (
          <span key={index}>
            {cleanText.split('\n').map((line, i, arr) => (
              <React.Fragment key={i}>
                {line}
                {i !== arr.length - 1 && <br />}
              </React.Fragment>
            ))}
          </span>
        );
      }
      return part;
    });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!query.trim() || !workspaceId) return;

    const userQuery = query;
    setChatHistory(prev => [...prev, { role: 'user', text: userQuery }, { role: 'ai', text: '' }]);
    setQuery('');
    setLoading(true);

    try {
      const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` },
        body: JSON.stringify({ query: userQuery })
      });

      if (!response.ok) {
        setChatHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1].text = `❌ Error: ${response.statusText}`;
          return newHistory;
        });
        setLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        aiText += chunk;
        
        setChatHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1].text = aiText;
          return newHistory;
        });
      }
    } catch (err) {
      setChatHistory(prev => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1].text += "\n\n❌ Failed to connect to backend.";
        return newHistory;
      });
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
    } else if (activeMedia.loc !== null && typeof activeMedia.loc === 'number') {
      playerRef.current.seekTo(activeMedia.loc, true);
      playerRef.current.playVideo();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setChatHistory([]);
    setWorkspaceId('');
    setActiveMedia({ type: null, src: '', pdfFile: '', loc: null, timestamp: Date.now() });
  };

  if (!token) return <Login setToken={setToken} />;

  const activeWorkspace = workspaces.find(w => w.id.toString() === workspaceId?.toString());

  return (
    <div className="w-full h-screen bg-surface-100 text-gray-100 flex flex-col font-sans">
      <header className="w-full h-16 bg-surface-200 border-b border-surface-400 flex items-center justify-between px-6 shadow-sm shrink-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-xl font-bold text-white tracking-wider shadow-sm">AC</div>
          <h1 className="text-xl font-bold tracking-tight text-white">Academic AI Workspace</h1>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 bg-surface-300 px-3 py-1.5 rounded-xl border border-surface-400 shadow-sm">
            <FolderSync className="w-4 h-4 text-blue-400" />
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="bg-transparent text-sm font-semibold text-gray-200 focus:outline-none cursor-pointer"
            >
              {workspaces.length === 0 && <option value="">No Workspaces Available</option>}
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id} className="bg-surface-300">
                  {ws.title || ws.name || `Workspace ${ws.id}`}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleLogout} className="flex items-center space-x-1 text-gray-400 hover:text-red-400 transition-colors cursor-pointer" title="Log out">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col lg:flex-row overflow-hidden">
        <section className={`transition-all duration-300 ease-in-out bg-surface-100 border-b lg:border-b-0 lg:border-r border-surface-400 flex flex-col items-center p-6 overflow-y-auto 
          ${activeMedia.src ? 'h-[40vh] lg:h-full lg:w-1/2' : 'h-[30vh] lg:h-full lg:w-1/3'}`}>
          
          <div className="w-full mb-4 flex items-center space-x-2 bg-surface-200 px-4 py-2 rounded-xl border border-surface-400 shadow-sm mt-auto shrink-0">
            <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">Active Media:</span>
            <input
              type="text"
              readOnly
              value={activeMedia.src ? `${activeMedia.type.toUpperCase()} | ${activeMedia.pdfFile || activeMedia.src} | ${activeMedia.loc}` : ''}
              placeholder="Waiting for media selection..."
              className="flex-1 bg-transparent text-blue-400 font-mono text-sm focus:outline-none"
            />
          </div>

          <div className="w-full aspect-video bg-surface-200 rounded-xl overflow-hidden border border-surface-400 shadow-sm flex items-center justify-center shrink-0">
            {activeMedia.type === 'video' ? (
              <YouTube
                videoId={activeMedia.src}
                opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }}
                onReady={onPlayerReady}
                className="w-full h-full aspect-video"
              />
            ) : activeMedia.type === 'pdf' ? (
              <iframe 
                key={`${activeMedia.pdfFile}-${activeMedia.timestamp}`} 
                src={activeMedia.src} 
                className="w-full h-full rounded-xl bg-gray-200 border-0" 
                title="PDF Viewer"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full bg-surface-200 border-2 border-dashed border-surface-400 rounded-xl text-gray-500 w-full">
                <Video className="w-10 h-10 mb-3 text-gray-600" />
                <p className="text-sm font-medium text-gray-300">Media will be shown here</p>
                <p className="text-xs mt-1 text-gray-500">Click a smart citation to load a Video or PDF</p>
              </div>
            )}
          </div>

          <div className="mt-4 mb-6 text-center max-w-md shrink-0">
            <h3 className="text-sm font-semibold text-gray-400 flex items-center justify-center">
              <Video className="w-4 h-4 text-blue-500 mr-2" /> Auto-Switching Media Sync Active
            </h3>
          </div>

          {activeWorkspace?.is_owner && (
            <div className="w-full max-w-md border-t border-surface-400 pt-6 pb-2 shrink-0">
              <UploadZone workspaceId={workspaceId} onUploadSuccess={() => setRefreshKey(prev => prev + 1)} />
            </div>
          )}

          <div className="w-full max-w-md space-y-4 shrink-0 pb-10">
            {workspaceId && activeWorkspace && (
              <>
                {activeWorkspace.is_owner ? (
                  <>
                    <ManageDocuments workspaceId={workspaceId} refreshKey={refreshKey} />
                    <InviteCollaborator workspaceId={workspaceId} onInviteSuccess={() => setRefreshKey(prev => prev + 1)} />
                    <ManageCollaborators workspaceId={workspaceId} refreshKey={refreshKey} />
                  </>
                ) : (
                  <div className="bg-blue-900/30 border border-blue-700 p-4 rounded-xl flex flex-col items-center justify-center text-center space-y-2 mt-4 shadow-sm">
                    <div className="bg-blue-600 p-2 rounded-xl">
                      <FolderSync className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-sm text-blue-200">
                      You are collaborating in a workspace shared by <span className="font-bold text-white capitalize">{activeWorkspace.owner_username}</span>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className={`transition-all duration-300 ease-in-out flex flex-col bg-surface-200 ${activeMedia.src ? 'h-[60vh] lg:h-full lg:w-1/2' : 'h-[70vh] lg:h-full lg:w-2/3'}`}>
          <div className="flex justify-center items-center py-3 bg-surface-200 border-b border-surface-400 shrink-0 space-x-3">
            <button onClick={() => setRightPanelTab('cortex')} className={`px-6 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer flex items-center ${rightPanelTab === 'cortex' ? 'bg-blue-600 text-white shadow-sm' : 'bg-surface-300 text-gray-400 hover:text-white border border-surface-400'}`}>
              <Activity className="w-4 h-4 mr-2" /> Cortex
            </button>
            <button onClick={() => setRightPanelTab('chat')} className={`px-6 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer ${rightPanelTab === 'chat' ? 'bg-blue-600 text-white shadow-sm' : 'bg-surface-300 text-gray-400 hover:text-white border border-surface-400'}`}>
              AI Chat
            </button>
            <button onClick={() => setRightPanelTab('artifacts')} className={`px-6 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer ${rightPanelTab === 'artifacts' ? 'bg-blue-600 text-white shadow-sm' : 'bg-surface-300 text-gray-400 hover:text-white border border-surface-400'}`}>
              Artifacts
            </button>
            <button onClick={() => setRightPanelTab('review')} className={`px-6 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer ${rightPanelTab === 'review' ? 'bg-blue-600 text-white shadow-sm' : 'bg-surface-300 text-gray-400 hover:text-white border border-surface-400'}`}>
              Daily Review
            </button>
          </div>

          <div className={`flex-1 overflow-hidden ${rightPanelTab === 'cortex' ? 'block' : 'hidden'}`}>
            <CortexPanel workspaceId={workspaceId} onResourceClick={handleGraphResourceClick} />
          </div>

          <div className={`flex-1 flex flex-col h-full overflow-hidden ${rightPanelTab === 'chat' ? 'block' : 'hidden'}`}>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 space-y-3">
                  <MessageSquare className="w-12 h-12 text-gray-600" />
                  <p className="text-sm font-medium">Workspace chat ready. Ask anything about your ingested knowledge base!</p>
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-4 py-3 shadow-sm text-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-surface-300 text-gray-100 rounded-bl-none border border-surface-400'}`}>
                      {msg.role === 'user' ? msg.text : renderMessageWithSmartTimestamps(msg.text)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-surface-200 border-t border-surface-400 flex space-x-3 items-center shrink-0">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask a question about your knowledge base..."
                disabled={loading || !workspaceId}
                className="flex-1 bg-surface-300 text-white placeholder-gray-500 px-4 py-3 rounded-xl border border-surface-400 focus:outline-none focus:border-blue-500 transition-colors text-sm disabled:opacity-50"
              />
              <button type="submit" disabled={loading || !workspaceId} className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl cursor-pointer disabled:opacity-50 transition-colors shadow-sm">
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>

          <div className={`flex-1 overflow-hidden p-4 ${rightPanelTab === 'artifacts' ? 'block' : 'hidden'}`}>
            <ArtifactsPanel workspaceId={workspaceId} onResourceClick={handleGraphResourceClick} refreshKey={refreshKey} />
          </div>

          <div className={`flex-1 overflow-hidden ${rightPanelTab === 'review' ? 'block' : 'hidden'}`}>
            <DailyReview workspaceId={workspaceId} isActive={rightPanelTab === 'review'} onResourceClick={handleGraphResourceClick} />
          </div>
        </section>
      </main>
    </div>
  );
}