// src/ArtifactsPanel.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, X, Sparkles, ChevronLeft, Network, CreditCard, HelpCircle, CheckCircle2, RotateCw, AlertCircle, ArrowRight, BookOpen, Trash2, CheckSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';

import { ReactFlow, Controls, Background, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// --- UTILITY EXTRACTED OUTSIDE COMPONENT ---
const parseJsonContent = (raw) => {
    try {
        const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return null;
    }
};

// ==========================================
// EXTRACTED VIEW RENDERERS (Prevents State Wiping)
// ==========================================

const KnowledgeGraphViewer = ({ content, onResourceClick }) => {
    const data = parseJsonContent(content);
    const [nodes, setNodes] = useState(data?.nodes || []);
    const [edges, setEdges] = useState(data?.edges || []);
    const [selectedNodeData, setSelectedNodeData] = useState(null);

    const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
    const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

    if (!data || !data.nodes) return <div className="p-6 text-red-400">Failed to parse Graph structure. Try generating again.</div>;

    return (
        <div className="w-full h-full relative bg-[#0f111a]">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={(_, node) => setSelectedNodeData(node.data)}
                fitView
                className="dark"
            >
                <Background color="#333" gap={16} />
                <Controls className="bg-gray-800 fill-white" />
            </ReactFlow>

            <div className="absolute top-4 left-4 bg-gray-900/80 backdrop-blur border border-gray-700 px-4 py-2 rounded-lg text-xs font-mono text-gray-300 pointer-events-none z-10 shadow-lg">
                <Network className="inline w-4 h-4 mr-2 text-purple-400" />
                Drag nodes to arrange. Click a node to deep-dive.
            </div>

            <AnimatePresence>
                {selectedNodeData && (
                    <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="absolute top-0 right-0 w-[450px] h-full bg-gray-900/95 backdrop-blur-xl border-l border-gray-700 shadow-2xl z-50 flex flex-col"
                    >
                        <div className="p-6 border-b border-gray-800 flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-1">{selectedNodeData.label}</h3>
                                <p className="text-purple-400 text-sm font-medium">{selectedNodeData.summary}</p>
                            </div>
                            <button
                                onClick={() => setSelectedNodeData(null)}
                                className="bg-gray-800 hover:bg-gray-700 p-2 rounded-full text-gray-400 hover:text-white transition-colors shrink-0"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="prose prose-invert prose-sm">
                                <h4 className="text-gray-500 uppercase tracking-widest text-xs font-bold mb-3">Deep Dive</h4>
                                <p className="text-gray-300 leading-relaxed text-sm mb-8 whitespace-pre-wrap">
                                    {selectedNodeData.details}
                                </p>
                            </div>

                            {selectedNodeData.resources && selectedNodeData.resources.length > 0 && (
                                <div>
                                    <h4 className="text-gray-500 uppercase tracking-widest text-xs font-bold mb-3">Recommended Resources</h4>
                                    <div className="space-y-3">
                                        {selectedNodeData.resources.map((res, idx) => (
                                            <div
                                                key={idx}
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Prevent bleeding into the ReactFlow canvas
                                                    onResourceClick && onResourceClick(res.link);
                                                }}
                                                className="group bg-gray-950 border border-gray-800 hover:border-purple-500/50 p-4 rounded-xl transition-colors cursor-pointer flex flex-col"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-semibold text-gray-200 text-sm group-hover:text-purple-300 transition-colors">{res.title}</span>
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border flex items-center ${res.type === 'video' ? 'bg-red-900/30 text-red-400 border-red-800' : 'bg-blue-900/30 text-blue-400 border-blue-800'}`}>
                                                        {res.type}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-gray-500 font-mono truncate">{res.link}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const FlashcardsViewer = ({ content, artifactTitle, triggerQuizGeneration }) => {
    const cards = parseJsonContent(content);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    const [knownCards, setKnownCards] = useState(new Set());
    const [reviewCards, setReviewCards] = useState(new Set());

    if (!cards || !Array.isArray(cards)) return <div className="p-6 text-red-400">Failed to parse Flashcards.</div>;
    const currentCard = cards[currentIndex];

    const isNeedsReview = reviewCards.has(currentIndex);

    const markKnownAndNext = () => {
        setKnownCards(prev => new Set(prev).add(currentIndex));
        setReviewCards(prev => { const s = new Set(prev); s.delete(currentIndex); return s; });
        nextCard();
    };

    const markReviewAndNext = () => {
        setReviewCards(prev => new Set(prev).add(currentIndex));
        setKnownCards(prev => { const s = new Set(prev); s.delete(currentIndex); return s; });
        nextCard();
    };

    const nextCard = () => {
        setIsFlipped(false);
        setTimeout(() => {
            if (currentIndex < cards.length - 1) setCurrentIndex(prev => prev + 1);
        }, 150);
    };

    const prevCard = () => {
        setIsFlipped(false);
        setTimeout(() => {
            if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
        }, 150);
    };

    const totalAttempted = knownCards.size + reviewCards.size;
    const progressPercentage = (totalAttempted / cards.length) * 100;
    const isComplete = totalAttempted === cards.length && cards.length > 0;

    return (
        <div className="flex flex-col items-center h-full p-8 bg-[#0B0D17] relative">

            <div className="w-full max-w-2xl mb-10">
                <div className="flex justify-between text-xs font-mono text-gray-500 mb-2">
                    <span>STUDY SET PROGRESS</span>
                    <span className="flex space-x-4">
                        <span className="text-green-500">{knownCards.size} MASTERED</span>
                        <span className="text-red-400">{reviewCards.size} TO REVIEW</span>
                    </span>
                </div>
                <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }} />
                </div>
                <div className="text-center mt-3 text-sm text-gray-400">
                    Card {currentIndex + 1} of {cards.length}
                </div>
            </div>

            <div className="relative w-full max-w-2xl h-[400px] perspective-1000">
                <motion.div
                    className="w-full h-full relative preserve-3d cursor-pointer"
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    onClick={() => setIsFlipped(!isFlipped)}
                >
                    <div className={`absolute w-full h-full backface-hidden bg-gray-900 border ${isNeedsReview ? 'border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-gray-700 hover:border-indigo-500/50'} rounded-3xl p-10 flex flex-col items-center justify-center text-center shadow-2xl transition-colors`}>
                        <span className="absolute top-6 left-6 text-xs font-bold uppercase tracking-widest text-indigo-400 bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-800">
                            {currentCard?.tag || "Concept"}
                        </span>
                        {isNeedsReview && (
                            <span className="absolute top-6 right-6 text-xs font-bold uppercase tracking-widest text-red-400 bg-red-900/30 px-3 py-1 rounded-full border border-red-800 flex items-center">
                                <AlertCircle className="w-3 h-3 mr-1" /> Needs Review
                            </span>
                        )}
                        <HelpCircle className={`w-12 h-12 mb-6 ${isNeedsReview ? 'text-red-500/50' : 'text-gray-700'}`} />
                        <h2 className="text-3xl font-bold text-white leading-tight">{currentCard?.question}</h2>
                        <span className="absolute bottom-6 text-xs text-gray-500 font-mono animate-pulse flex items-center">
                            <RotateCw className="w-3 h-3 mr-2" /> Click to reveal answer
                        </span>
                    </div>

                    <div className="absolute w-full h-full backface-hidden bg-indigo-950 border border-indigo-700 rounded-3xl p-10 flex flex-col justify-center shadow-2xl overflow-y-auto" style={{ transform: "rotateY(180deg)" }}>
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-4 flex items-center">
                            <Sparkles className="w-4 h-4 mr-2" /> Answer
                        </span>
                        <div className="text-lg text-gray-200 leading-relaxed">
                            {currentCard?.answer.split('\n').map((line, i) => (
                                <p key={i} className="mb-2">{line}</p>
                            ))}
                        </div>
                    </div>
                </motion.div>

                <AnimatePresence>
                    {isComplete && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute inset-0 bg-gray-900/80 backdrop-blur-md rounded-3xl z-50 flex flex-col items-center justify-center text-center p-10 border border-gray-700 shadow-2xl"
                        >
                            <div className="bg-indigo-600 p-4 rounded-full mb-6">
                                <BookOpen className="w-10 h-10 text-white" />
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-3">Deck Complete!</h2>
                            <p className="text-gray-300 mb-8 max-w-sm">You have reviewed all the flashcards in this set. Are you ready to test your knowledge with a generated quiz?</p>

                            <div className="flex space-x-4">
                                <button
                                    onClick={() => {
                                        setKnownCards(new Set());
                                        setReviewCards(new Set());
                                        setCurrentIndex(0);
                                    }}
                                    className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl transition-colors"
                                >
                                    Study Again
                                </button>
                                <button
                                    onClick={() => triggerQuizGeneration(artifactTitle)}
                                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors flex items-center shadow-lg shadow-indigo-900/50"
                                >
                                    <Sparkles className="w-5 h-5 mr-2" /> Generate Quiz
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="w-full max-w-2xl mt-10 flex items-center justify-between">
                <button
                    onClick={prevCard}
                    disabled={currentIndex === 0}
                    className="px-6 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white font-medium rounded-xl transition-colors"
                >
                    Previous
                </button>

                <div className="flex space-x-3">
                    <button
                        onClick={markReviewAndNext}
                        className="px-6 py-3 border border-red-800/50 text-red-400 hover:bg-red-900/30 font-medium rounded-xl transition-colors"
                    >
                        Needs Review
                    </button>
                    <button
                        onClick={markKnownAndNext}
                        className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-xl flex items-center transition-colors shadow-lg shadow-green-900/20"
                    >
                        <CheckCircle2 className="w-5 h-5 mr-2" /> Got It
                    </button>
                    <button
                        onClick={nextCard}
                        disabled={currentIndex === cards.length - 1}
                        className="px-6 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white font-medium rounded-xl transition-colors flex items-center"
                    >
                        Skip <ArrowRight className="w-4 h-4 ml-2" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- NEW: Interactive Quiz Viewer ---
// --- Interactive Quiz Viewer with Shuffled Options ---
const QuizViewer = ({ content }) => {
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [score, setScore] = useState(0);
    const [isComplete, setIsComplete] = useState(false);

    // Array shuffle helper (Fisher-Yates)
    const shuffleArray = (array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    // Pre-process questions to shuffle option order on initial load
    const loadAndShuffleQuestions = useCallback(() => {
        const parsed = parseJsonContent(content);
        if (parsed && Array.isArray(parsed)) {
            const shuffledQuestions = parsed.map(q => ({
                ...q,
                options: q.options ? shuffleArray(q.options) : []
            }));
            setQuestions(shuffledQuestions);
        }
    }, [content]);

    useEffect(() => {
        loadAndShuffleQuestions();
    }, [loadAndShuffleQuestions]);

    if (!questions || questions.length === 0) return <div className="p-6 text-red-400">Failed to parse Quiz structure.</div>;
    const currentQ = questions[currentIndex];

    const handleSubmit = () => {
        setIsSubmitted(true);
        if (selectedOption === currentQ.correct_answer) {
            setScore(s => s + 1);
        }
    };

    const handleNext = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(i => i + 1);
            setSelectedOption(null);
            setIsSubmitted(false);
        } else {
            setIsComplete(true);
        }
    };

    const handleRetake = () => {
        loadAndShuffleQuestions(); // Re-shuffle options for a fresh attempt
        setCurrentIndex(0);
        setScore(0);
        setIsComplete(false);
        setSelectedOption(null);
        setIsSubmitted(false);
    };

    if (isComplete) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 bg-[#0B0D17]">
                <div className="bg-gray-900 border border-gray-800 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
                    <CheckSquare className="w-16 h-16 text-green-500 mx-auto mb-6" />
                    <h2 className="text-3xl font-bold text-white mb-2">Quiz Complete!</h2>
                    <p className="text-gray-400 mb-8">You scored {score} out of {questions.length}</p>
                    <div className="w-full bg-gray-800 rounded-full h-4 mb-8 overflow-hidden">
                        <div className="bg-green-500 h-full transition-all" style={{ width: `${(score / questions.length) * 100}%` }}></div>
                    </div>
                    <button
                        onClick={handleRetake}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-colors cursor-pointer"
                    >
                        Retake Quiz
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center h-full p-8 bg-[#0B0D17] overflow-y-auto">
            <div className="w-full max-w-3xl mb-8 flex justify-between items-center text-sm font-mono text-gray-500">
                <span>QUESTION {currentIndex + 1} OF {questions.length}</span>
                <span>SCORE: {score}</span>
            </div>

            <div className="w-full max-w-3xl bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-xl">
                <h2 className="text-2xl font-bold text-white mb-8">{currentQ.question}</h2>

                <div className="space-y-3 mb-8">
                    {currentQ.options.map((opt, idx) => {
                        let btnClass = "w-full text-left px-6 py-4 rounded-xl border transition-all text-base font-medium cursor-pointer ";

                        if (!isSubmitted) {
                            btnClass += selectedOption === opt
                                ? "bg-blue-600/20 border-blue-500 text-blue-100"
                                : "bg-gray-800 border-gray-700 hover:border-gray-500 text-gray-300";
                        } else {
                            if (opt === currentQ.correct_answer) {
                                btnClass += "bg-green-900/30 border-green-500 text-green-200";
                            } else if (opt === selectedOption) {
                                btnClass += "bg-red-900/30 border-red-500 text-red-200";
                            } else {
                                btnClass += "bg-gray-800 border-gray-700 text-gray-500 opacity-50 cursor-not-allowed";
                            }
                        }

                        return (
                            <button
                                key={idx}
                                disabled={isSubmitted}
                                onClick={() => setSelectedOption(opt)}
                                className={btnClass}
                            >
                                {opt}
                            </button>
                        );
                    })}
                </div>

                <AnimatePresence>
                    {isSubmitted && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-6 rounded-xl border mb-8 ${selectedOption === currentQ.correct_answer ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'}`}
                        >
                            <h3 className={`font-bold mb-2 flex items-center ${selectedOption === currentQ.correct_answer ? 'text-green-400' : 'text-red-400'}`}>
                                {selectedOption === currentQ.correct_answer ? <CheckCircle2 className="w-5 h-5 mr-2" /> : <X className="w-5 h-5 mr-2" />}
                                {selectedOption === currentQ.correct_answer ? 'Correct!' : 'Incorrect'}
                            </h3>
                            <p className="text-gray-300 text-sm leading-relaxed">{currentQ.explanation}</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex justify-end border-t border-gray-800 pt-6">
                    {!isSubmitted ? (
                        <button
                            onClick={handleSubmit}
                            disabled={!selectedOption}
                            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold rounded-xl transition-colors cursor-pointer"
                        >
                            Check Answer
                        </button>
                    ) : (
                        <button
                            onClick={handleNext}
                            className="px-8 py-3 bg-white hover:bg-gray-200 text-gray-900 font-bold rounded-xl transition-colors flex items-center cursor-pointer"
                        >
                            {currentIndex < questions.length - 1 ? 'Next Question' : 'View Results'} <ArrowRight className="w-4 h-4 ml-2" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};


// ==========================================
// MAIN PANEL RENDER
// ==========================================

export default function ArtifactsPanel({ workspaceId, onResourceClick }) {
    const [artifacts, setArtifacts] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [title, setTitle] = useState('');
    const [artifactType, setArtifactType] = useState('markdown');
    const [viewingArtifact, setViewingArtifact] = useState(null);

    useEffect(() => {
        fetchArtifacts();
    }, [workspaceId]);

    const fetchArtifacts = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8000/api/artifacts/', {
                headers: { 'Authorization': `Token ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setArtifacts(data.filter(a => a.workspace?.toString() === workspaceId?.toString()));
            }
        } catch (error) {
            console.error("Failed to fetch artifacts", error);
        }
    };

    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!prompt) return;

        setIsGenerating(true);
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/generate_artifact/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${token}`
                },
                body: JSON.stringify({
                    prompt,
                    title: title || 'Generated Artifact',
                    artifact_type: artifactType
                })
            });

            if (response.ok) {
                const newArtifact = await response.json();
                setArtifacts(prev => [newArtifact, ...prev]);
                setShowForm(false);
                setPrompt('');
                setTitle('');
                setViewingArtifact(newArtifact);
            }
        } catch (error) {
            console.error("Failed to generate artifact", error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDeleteArtifact = async (e, id) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to permanently delete this artifact?')) return;

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`http://localhost:8000/api/artifacts/${id}/`, {
                method: 'DELETE',
                headers: { 'Authorization': `Token ${token}` }
            });

            if (response.ok || response.status === 204) {
                setArtifacts(prev => prev.filter(a => a.id !== id));
                if (viewingArtifact?.id === id) setViewingArtifact(null);
            }
        } catch (error) {
            console.error("Failed to delete artifact", error);
        }
    };

    // --- AUTOMATED QUIZ TRIGGER PIPELINE ---
    const triggerQuizGeneration = async (sourceTitle) => {
        const quizTitle = `Quiz: ${sourceTitle}`;
        const quizPrompt = `Generate a challenging 5-question multiple choice quiz to test my knowledge on the concepts covered in: ${sourceTitle}.`;

        setViewingArtifact(null);
        setArtifactType('quiz'); // Requests JSON from the new backend schema
        setTitle(quizTitle);
        setPrompt(quizPrompt);
        setShowForm(true);
        setIsGenerating(true);

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/generate_artifact/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${token}`
                },
                body: JSON.stringify({
                    prompt: quizPrompt,
                    title: quizTitle,
                    artifact_type: 'quiz'
                })
            });

            if (response.ok) {
                const newArtifact = await response.json();
                setArtifacts(prev => [newArtifact, ...prev]);
                setShowForm(false);
                setPrompt('');
                setTitle('');
                setViewingArtifact(newArtifact);
            }
        } catch (error) {
            console.error("Failed to auto-generate quiz", error);
        } finally {
            setIsGenerating(false);
        }
    };

    if (viewingArtifact) {
        const isGraph = viewingArtifact.artifact_type === 'graph';
        const isFlashcard = viewingArtifact.artifact_type === 'flashcards';
        const isQuiz = viewingArtifact.artifact_type === 'quiz';

        return (
            <div className="flex flex-col h-full bg-[#0B0D17] rounded-xl border border-gray-800 overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900 z-10">
                    <button
                        onClick={() => setViewingArtifact(null)}
                        className="flex items-center text-gray-400 hover:text-white transition-colors text-sm font-medium bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500"
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" /> Back to Library
                    </button>
                    <div className="flex items-center">
                        {isGraph ? <Network className="w-5 h-5 text-purple-400 mr-3" /> :
                            isFlashcard ? <CreditCard className="w-5 h-5 text-indigo-400 mr-3" /> :
                                isQuiz ? <CheckSquare className="w-5 h-5 text-green-400 mr-3" /> :
                                    <FileText className="w-5 h-5 text-blue-500 mr-3" />}
                        <h3 className="text-white font-bold text-lg truncate max-w-md">{viewingArtifact.title}</h3>
                    </div>
                    <div className="w-24"></div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    {isGraph ? (
                        <KnowledgeGraphViewer content={viewingArtifact.content} onResourceClick={onResourceClick} />
                    ) : isFlashcard ? (
                        <FlashcardsViewer content={viewingArtifact.content} artifactTitle={viewingArtifact.title} triggerQuizGeneration={triggerQuizGeneration} />
                    ) : isQuiz ? (
                        <QuizViewer content={viewingArtifact.content} />
                    ) : (
                        <div className="p-10 overflow-y-auto h-full max-w-4xl mx-auto">
                            <ReactMarkdown
                                components={{
                                    h1: ({ node, ...props }) => <h1 className="text-3xl font-extrabold text-white mb-8 border-b border-gray-800 pb-4" {...props} />,
                                    h2: ({ node, ...props }) => <h2 className="text-2xl font-bold text-blue-400 mt-10 mb-6" {...props} />,
                                    h3: ({ node, ...props }) => <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4" {...props} />,
                                    p: ({ node, ...props }) => <p className="mb-6 text-gray-300 leading-loose text-base" {...props} />,
                                    ul: ({ node, ...props }) => <ul className="list-disc mb-6 space-y-3 text-gray-300 text-base pl-8" {...props} />,
                                    ol: ({ node, ...props }) => <ol className="list-decimal mb-6 space-y-3 text-gray-300 text-base pl-8" {...props} />,
                                    li: ({ node, ...props }) => <li className="pl-2" {...props} />,
                                    strong: ({ node, ...props }) => <strong className="font-bold text-white bg-gray-800/50 px-1 rounded" {...props} />,
                                    code: ({ node, inline, ...props }) =>
                                        inline ? (
                                            <code className="bg-gray-800 text-blue-300 px-2 py-1 rounded text-sm font-mono border border-gray-700" {...props} />
                                        ) : (
                                            <pre className="bg-[#050505] border border-gray-800 rounded-xl p-6 mb-6 overflow-x-auto shadow-2xl">
                                                <code className="text-gray-300 text-sm font-mono leading-relaxed" {...props} />
                                            </pre>
                                        )
                                }}
                            >
                                {viewingArtifact.content}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-900 rounded-xl border border-gray-800 overflow-hidden relative shadow-2xl">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
                <h3 className="text-white font-bold flex items-center text-lg">
                    <Sparkles className="w-5 h-5 text-blue-500 mr-3" /> Artifact Library
                </h3>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-lg transition-all shadow-lg shadow-blue-900/20"
                >
                    {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {showForm ? 'Cancel' : 'Generate New'}
                </button>
            </div>

            <div className="p-6 overflow-y-auto h-full bg-[#0B0D17]">
                {showForm && (
                    <form onSubmit={handleGenerate} className="bg-gray-900 p-6 rounded-2xl border border-gray-700 mb-8 shadow-2xl animate-in fade-in slide-in-from-top-4">

                        <div className="flex space-x-3 mb-6 bg-[#0B0D17] p-1.5 rounded-xl border border-gray-800">
                            <button
                                type="button"
                                onClick={() => setArtifactType('markdown')}
                                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center ${artifactType === 'markdown' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                            >
                                <FileText className="w-4 h-4 mr-2" /> Guide
                            </button>
                            <button
                                type="button"
                                onClick={() => setArtifactType('graph')}
                                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center ${artifactType === 'graph' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                            >
                                <Network className="w-4 h-4 mr-2" /> Map
                            </button>
                            <button
                                type="button"
                                onClick={() => setArtifactType('flashcards')}
                                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center ${artifactType === 'flashcards' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                            >
                                <CreditCard className="w-4 h-4 mr-2" /> Flashcards
                            </button>
                            <button
                                type="button"
                                onClick={() => setArtifactType('quiz')}
                                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center ${artifactType === 'quiz' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                            >
                                <CheckSquare className="w-4 h-4 mr-2" /> Quiz
                            </button>
                        </div>

                        <input
                            type="text"
                            placeholder="Give your artifact a title..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-[#0B0D17] text-white placeholder-gray-600 px-4 py-3 rounded-xl border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none mb-4 text-base font-medium"
                        />
                        <textarea
                            placeholder="What specific topics should the AI synthesize?"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={4}
                            className="w-full bg-[#0B0D17] text-white placeholder-gray-600 px-4 py-3 rounded-xl border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none mb-6 text-base resize-none"
                        />
                        <button
                            type="submit"
                            disabled={isGenerating || !prompt}
                            className="w-full bg-white hover:bg-gray-200 text-gray-900 disabled:bg-gray-800 disabled:text-gray-500 font-bold py-3.5 rounded-xl transition-colors flex justify-center items-center text-base shadow-xl"
                        >
                            {isGenerating ? (
                                <><RotateCw className="w-5 h-5 mr-2 animate-spin" /> Synthesizing Knowledge...</>
                            ) : 'Generate Artifact'}
                        </button>
                    </form>
                )}

                {artifacts.length === 0 && !showForm ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <div className="bg-gray-800/50 p-6 rounded-full mb-4">
                            <Sparkles className="w-10 h-10 text-gray-600" />
                        </div>
                        <p className="text-lg font-medium text-gray-400">Your library is empty.</p>
                        <p className="text-sm mt-1">Generate a map, guide, or flashcards to get started.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {artifacts.map(artifact => (
                            <div
                                key={artifact.id}
                                onClick={() => setViewingArtifact(artifact)}
                                className="bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-600 rounded-2xl p-5 cursor-pointer transition-all flex flex-col group shadow-lg"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center overflow-hidden">
                                        <div className={`p-2 rounded-lg mr-3 shrink-0 ${artifact.artifact_type === 'graph' ? 'bg-purple-900/30' : artifact.artifact_type === 'flashcards' ? 'bg-indigo-900/30' : artifact.artifact_type === 'quiz' ? 'bg-green-900/30' : 'bg-blue-900/30'}`}>
                                            {artifact.artifact_type === 'graph' ? (
                                                <Network className="w-5 h-5 text-purple-400" />
                                            ) : artifact.artifact_type === 'flashcards' ? (
                                                <CreditCard className="w-5 h-5 text-indigo-400" />
                                            ) : artifact.artifact_type === 'quiz' ? (
                                                <CheckSquare className="w-5 h-5 text-green-400" />
                                            ) : (
                                                <FileText className="w-5 h-5 text-blue-500" />
                                            )}
                                        </div>
                                        <span className="text-gray-100 font-bold text-base truncate">{artifact.title}</span>
                                    </div>

                                    <button
                                        onClick={(e) => handleDeleteArtifact(e, artifact.id)}
                                        className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-900/30 transition-colors shrink-0"
                                        title="Delete Artifact"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="flex justify-between items-center mt-auto">
                                    <span className="text-xs font-mono text-gray-500 uppercase">{artifact.artifact_type}</span>
                                    <span className="text-xs font-semibold text-gray-400 bg-gray-800 px-2 py-1 rounded group-hover:bg-white group-hover:text-black transition-colors">Open</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}