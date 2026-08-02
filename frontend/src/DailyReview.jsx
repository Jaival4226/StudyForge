import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, CheckCircle2, RotateCw, BrainCircuit, Video, FileText } from 'lucide-react';
import { EmptyState, LoadingState } from './components/SharedUI'; // <-- Added

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
                    className={`inline-flex items-center px-3 py-1 rounded-md text-xs mx-2 font-mono transition-colors shadow-sm cursor-pointer text-white ${isVideo ? 'bg-blue-600 hover:bg-blue-500 border border-blue-500' : 'bg-red-600 hover:bg-red-500 border border-red-500'}`}
                >
                    {isVideo ? <Video className="w-3 h-3 mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
                    {timeOrPage}
                </button>
            );
        }
        return <span className="ml-2 text-gray-300 font-mono">{locStr}</span>;
    };

    if (loading) return (
        <div className="flex h-full items-center justify-center p-8 bg-surface-200">
            <div className="w-full max-w-md"><LoadingState message="Analyzing neural gaps..." /></div>
        </div>
    );

    if (items.length === 0 || currentIndex >= items.length) {
        return (
            <div className="flex h-full items-center justify-center p-8 bg-surface-200">
                <div className="w-full max-w-md">
                    <EmptyState 
                        icon={BrainCircuit}
                        title="All Caught Up!"
                        message="You have no overdue concepts to review right now."
                        actionText="Refresh Queue"
                        onAction={fetchDueItems}
                        actionColor="bg-emerald-600 hover:bg-emerald-500" // Maintains emerald identity properly
                    />
                </div>
            </div>
        );
    }

    const currentItem = items[currentIndex];
    const progressPercentage = (currentIndex / items.length) * 100;

    return (
        <div className="flex flex-col items-center h-full p-8 bg-surface-200 relative">
            <div className="w-full max-w-2xl mb-10">
                <div className="flex justify-between text-xs font-mono text-gray-400 mb-2">
                    <span>DAILY REVIEW PROGRESS</span>
                    <span>{currentIndex} / {items.length} COMPLETED</span>
                </div>
                <div className="h-2 w-full bg-surface-400 rounded-xl overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }} />
                </div>
            </div>

            <div className="relative w-full max-w-2xl h-[400px] perspective-1000">
                <motion.div
                    className="w-full h-full relative preserve-3d cursor-pointer"
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    onClick={() => setIsFlipped(!isFlipped)}
                >
                    <div className="absolute w-full h-full backface-hidden bg-surface-300 border border-surface-400 hover:border-emerald-500/50 rounded-xl p-10 flex flex-col items-center justify-center text-center shadow-md transition-colors">
                        <span className="absolute top-6 left-6 text-xs font-bold uppercase tracking-widest text-emerald-400 bg-emerald-900/30 px-3 py-1 rounded-md border border-emerald-800">
                            Concept Review
                        </span>
                        <h2 className="text-3xl font-bold text-white leading-tight">{currentItem.tag}</h2>
                        <span className="absolute bottom-6 text-xs text-gray-500 font-mono animate-pulse flex items-center">
                            <RotateCw className="w-4 h-4 mr-2" /> Click to reveal context
                        </span>
                    </div>

                    <div className="absolute w-full h-full backface-hidden bg-surface-300 border border-emerald-700/50 rounded-xl p-8 flex flex-col justify-start shadow-md overflow-y-auto" style={{ transform: "rotateY(180deg)" }}>
                        <div className="sticky top-0 bg-surface-300/95 backdrop-blur-sm pb-4 mb-2 z-10 border-b border-surface-400">
                            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center">
                                <Sparkles className="w-4 h-4 mr-2" /> Source Context {renderLocation(currentItem.location)}
                            </span>
                        </div>
                        <div className="text-base text-gray-200 leading-relaxed italic border-l-4 border-emerald-500 pl-4 mt-2">
                            "{currentItem.snippet}"
                        </div>
                    </div>
                </motion.div>
            </div>

            <div className={`w-full max-w-2xl mt-10 flex items-center justify-center space-x-4 transition-all duration-300 ${!isFlipped ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                <button onClick={() => handleResult(false)} className="px-8 py-3 border border-red-800/50 text-red-400 hover:bg-red-900/30 font-bold rounded-xl transition-colors w-1/2 cursor-pointer">
                    Forgot It
                </button>
                <button onClick={() => handleResult(true)} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors shadow-sm w-1/2 flex items-center justify-center cursor-pointer">
                    <CheckCircle2 className="w-5 h-5 mr-2" /> Knew It
                </button>
            </div>
        </div>
    );
}