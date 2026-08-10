import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, CheckCircle2, RotateCw, BrainCircuit, Video, FileText, AlertTriangle } from 'lucide-react';
import { EmptyState, LoadingState } from './components/SharedUI';

export default function DailyReview({ workspaceId, isActive, onResourceClick }) {
    const [items, setItems] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (workspaceId && isActive) fetchDueItems();
    }, [workspaceId, isActive]);

    const fetchDueItems = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/daily_review/`, {
                headers: { 'Authorization': `Token ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setItems(data.review_items || []);
                setCurrentIndex(0);
                setIsFlipped(false);
            }
        } catch (error) {
            console.error("Failed to load daily review", error);
        } finally {
            setLoading(false);
        }
    };

    const handleResult = (correct) => {
        const currentItem = items[currentIndex];
        const token = localStorage.getItem('auth_token');
        fetch(`http://localhost:8000/api/workspaces/${workspaceId}/record_mastery/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` },
            body: JSON.stringify({ tag: currentItem.tag, correct })
        }).catch(error => console.error("Failed to record review", error));

        setIsFlipped(false);
        setTimeout(() => setCurrentIndex(prev => prev + 1), 150);
    };

    const renderLocation = (locStr) => {
        if (!locStr || locStr === "Unknown Source") return <span className="text-gray-500 ml-2">Unknown</span>;
        
        let cleanLoc = locStr.replace(/^\[|\]$/g, '');
        if (cleanLoc.includes('|')) {
            const [source, timeOrPage] = cleanLoc.split('|');
            const isVideo = source.length === 11 && !source.includes('.');
            
            return (
                <button 
                    onClick={(e) => { e.stopPropagation(); onResourceClick && onResourceClick(cleanLoc); }}
                    className={`inline-flex items-center px-3 py-1 rounded-md text-xs mx-2 font-bold transition-colors shadow-sm cursor-pointer border ${isVideo ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}
                >
                    {isVideo ? <Video className="w-3 h-3 mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
                    {timeOrPage}
                </button>
            );
        }
        return <span className="ml-2 text-gray-300 font-mono">{locStr}</span>;
    };

    if (loading) return (
        <div className="flex h-full items-center justify-center p-8 bg-surface-100">
            <div className="w-full max-w-md"><LoadingState message="Analyzing neural gaps..." /></div>
        </div>
    );

    if (items.length === 0 || currentIndex >= items.length) {
        return (
            <div className="flex h-full items-center justify-center p-8 bg-surface-100">
                <div className="w-full max-w-md">
                    <EmptyState 
                        icon={BrainCircuit}
                        title="All Caught Up!"
                        message="You have no overdue concepts to review in this workspace right now."
                        actionText="Refresh Queue"
                        onAction={fetchDueItems}
                        actionColor="bg-purple-600 hover:bg-purple-500"
                    />
                </div>
            </div>
        );
    }

    const currentItem = items[currentIndex];
    const progressPercentage = (currentIndex / items.length) * 100;

    return (
        <div className="flex flex-col items-center h-full p-8 bg-surface-100 relative">
            <div className="w-full max-w-2xl mb-10">
                <div className="flex justify-between text-xs font-bold text-gray-500 tracking-widest uppercase mb-2">
                    <span>DAILY REVIEW PROGRESS</span>
                    <span>{currentIndex} / {items.length} COMPLETED</span>
                </div>
                <div className="h-2 w-full bg-surface-400 rounded-xl overflow-hidden">
                    <div className="h-full bg-purple-600 transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }} />
                </div>
            </div>

            <div className="relative w-full max-w-2xl h-[400px] perspective-1000">
                <motion.div
                    className="w-full h-full relative preserve-3d cursor-pointer"
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    onClick={() => setIsFlipped(!isFlipped)}
                >
                    {/* FRONT OF CARD */}
                    <div className="absolute w-full h-full backface-hidden bg-white border border-surface-400 hover:border-purple-400 rounded-xl p-10 flex flex-col items-center justify-center text-center shadow-lg transition-colors">
                        <span className="absolute top-6 left-6 text-xs font-bold uppercase tracking-widest text-purple-600 bg-purple-50 px-3 py-1 rounded-md border border-purple-200">
                            Concept Review
                        </span>
                        <h2 className="text-3xl font-bold text-gray-900 leading-tight">{currentItem.tag}</h2>
                        <span className="absolute bottom-6 text-xs text-gray-400 font-mono animate-pulse flex items-center">
                            <RotateCw className="w-4 h-4 mr-2" /> Click to reveal context
                        </span>
                    </div>

                    {/* BACK OF CARD */}
                    <div className="absolute w-full h-full backface-hidden bg-gray-900 border border-gray-800 rounded-xl p-8 flex flex-col justify-start shadow-xl overflow-y-auto" style={{ transform: "rotateY(180deg)" }}>
                        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm pb-4 mb-2 z-10 border-b border-gray-800 flex items-center">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center">
                                <Sparkles className="w-4 h-4 mr-2" /> Source Context
                            </span>
                            {renderLocation(currentItem.location)}
                        </div>
                        <div className="text-base text-gray-200 leading-relaxed italic border-l-4 border-purple-500 pl-4 mt-4">
                            {/* 🚨 THE FIX: This Regex strips out the ugly raw file path tags from the text! */}
                            "{currentItem.snippet.replace(/\[([^|\]]+)\|([^\]]+)\]/g, '').trim()}"
                        </div>
                    </div>
                </motion.div>
            </div>

            <div className={`w-full max-w-2xl mt-10 flex items-center justify-center space-x-4 transition-all duration-300 ${!isFlipped ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                <button onClick={() => handleResult(false)} className="px-8 py-3 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold rounded-xl transition-colors shadow-sm w-1/2 flex items-center justify-center cursor-pointer">
                    <AlertTriangle className="w-5 h-5 mr-2" /> Needs Review
                </button>
                <button onClick={() => handleResult(true)} className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-colors shadow-sm w-1/2 flex items-center justify-center cursor-pointer">
                    <CheckCircle2 className="w-5 h-5 mr-2" /> Got It
                </button>
            </div>
        </div>
    );
}