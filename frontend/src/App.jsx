// src/App.jsx

import React, { useState, useRef } from 'react';
import YouTube from 'react-youtube';
import { Send, Video, MessageSquare } from 'lucide-react';

export default function App() {
  const [workspaceId, setWorkspaceId] = useState('3');
  const [activeVideoId, setActiveVideoId] = useState('BJ-VvGyQxho'); // Defaulting to Video 2!
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [pendingSeek, setPendingSeek] = useState(null);
  const playerRef = useRef(null);

  const timestampToSeconds = (timestamp) => {
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 3) {
      return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    } else if (parts.length === 2) {
      return (parts[0] * 60) + parts[1];
    }
    return 0;
  };

  const handleTimestampClick = (locationStr) => {
    const seconds = timestampToSeconds(locationStr);
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, true);
      playerRef.current.playVideo();
    }
  };

  // V3.0: The Smart Decoder! Reads [VideoID|Time] and turns it into a clean button
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
                    // 1. Is it a new video? Swap it!
                    if (videoId !== activeVideoId) {
                      setActiveVideoId(videoId);
                      setPendingSeek(timestampToSeconds(timestamp));
                    } else {
                      // 2. Already on this video? Just jump!
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
    if (!query.trim()) return;

    const userMsg = { role: 'user', text: query };
    setChatHistory(prev => [...prev, userMsg]);
    setLoading(true);
    setQuery('');

    try {
      const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setChatHistory(prev => [...prev, { role: 'ai', text: data.answer }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'ai', text: `❌ Error: ${data.error}` }]);
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'ai', text: "❌ Failed to connect to Django API server." }]);
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

  return (
    <div className="w-full h-screen bg-gray-900 text-gray-100 flex flex-col font-sans">
      <header className="w-full h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-lg font-bold text-white tracking-wider">AC</div>
          <h1 className="text-xl font-bold tracking-tight text-white">Academic AI Workspace <span className="text-xs text-blue-400 font-mono">v3.0 (Multi-Video Sync)</span></h1>
        </div>
        <div className="flex items-center space-x-2 bg-gray-900 px-3 py-1.5 rounded-md border border-gray-700">
          <span className="text-xs text-gray-400 font-mono">Active Workspace ID:</span>
          <input 
            type="number" 
            value={workspaceId} 
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="w-12 bg-transparent text-blue-400 font-mono font-bold text-center focus:outline-none"
          />
        </div>
      </header>

      <main className="flex-1 w-full flex overflow-hidden">
        
        <section className="w-1/2 h-full bg-gray-950 border-r border-gray-800 flex flex-col justify-center items-center p-6">
          <div className="w-full mb-4 flex items-center space-x-2 bg-gray-900 px-4 py-2 rounded-xl border border-gray-800 shadow-sm">
            <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">Active Video ID:</span>
            <input 
              type="text" 
              value={activeVideoId} 
              onChange={(e) => setActiveVideoId(e.target.value)}
              className="flex-1 bg-transparent text-blue-400 font-mono text-sm focus:outline-none"
              placeholder="Paste YouTube Video ID here..."
            />
          </div>

          <div className="w-full aspect-video bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-2xl flex items-center justify-center">
            <YouTube 
              videoId={activeVideoId} 
              opts={{ width: '100%', height: '100%', playerVars: { autoplay: 0 } }}
              onReady={onPlayerReady}
              className="w-full h-full aspect-video"
            />
          </div>
          <div className="mt-4 text-center max-w-md">
            <h3 className="text-sm font-semibold text-gray-400 flex items-center justify-center">
              <Video className="w-4 h-4 text-blue-500 mr-2" /> Auto-Switching Video Sync Active
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              When the AI generates a timestamp, clicking it will automatically swap this player to the correct video and skip to the absolute second.
            </p>
          </div>
        </section>

        <section className="w-1/2 h-full flex flex-col bg-gray-900">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {chatHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 space-y-3">
                <MessageSquare className="w-12 h-12 text-gray-700" />
                <p className="text-sm">Workspace chat ready. Ask anything about your ingested knowledge base!</p>
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-md text-sm leading-relaxed ${
                    msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700'
                  }`}>
                    {/* THIS IS THE EXACT LINE THAT APPLIES THE SMART DECODER */}
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

          <form onSubmit={handleSendMessage} className="p-4 bg-gray-800 border-t border-gray-700 flex space-x-3 items-center">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your ingested knowledge base..."
              className="flex-1 bg-gray-900 text-gray-100 placeholder-gray-500 px-4 py-3 rounded-xl border border-gray-700 focus:outline-none focus:border-blue-500 transition-colors text-sm"
            />
            <button
              type="submit"
              disabled={loading}
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