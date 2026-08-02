import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, X, Sparkles, ChevronLeft, Network, CreditCard, HelpCircle, CheckCircle2, RotateCw, AlertCircle, ArrowRight, BookOpen, Trash2, CheckSquare, Square, Video } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { ReactFlow, Controls, Background, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { EmptyState } from './components/SharedUI'; // <-- Added

const parseJsonContent = (raw) => {
    try {
        const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return null;
    }
};

const MarkdownViewer = ({ artifact }) => {
    const content = (artifact.content || '')
        .replace(/\[([a-zA-Z0-9_-]{11})\|([0-9:]+)\]/g, '')
        .replace(/\[(.*?\.pdf)\|([^\]]+)\]/g, '');

    return (
        <div className="flex flex-col h-full relative bg-surface-100 rounded-xl overflow-hidden">
            <div className="sticky top-0 z-20 bg-surface-200/95 backdrop-blur-md border-b border-surface-400 p-4 flex items-center shadow-sm">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center">
                    <FileText className="w-4 h-4 mr-2 text-blue-500" /> Study Guide
                </span>
            </div>
            <div className="p-10 overflow-y-auto h-full max-w-4xl mx-auto w-full">
                <ReactMarkdown
                    components={{
                        h1: ({ node, ...props }) => <h1 className="text-3xl font-extrabold text-white mb-8 border-b border-surface-400 pb-4" {...props} />,
                        h2: ({ node, ...props }) => <h2 className="text-2xl font-bold text-blue-400 mt-12 mb-6 border-b border-surface-400/50 pb-3" {...props} />,
                        h3: ({ node, ...props }) => <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4" {...props} />,
                        p: ({ node, ...props }) => <p className="mb-6 text-gray-300 leading-loose text-base" {...props} />,
                        ul: ({ node, ...props }) => <ul className="list-disc mb-6 space-y-3 text-gray-300 text-base pl-8" {...props} />,
                        ol: ({ node, ...props }) => <ol className="list-decimal mb-6 space-y-3 text-gray-300 text-base pl-8" {...props} />,
                        li: ({ node, ...props }) => <li className="pl-2" {...props} />,
                        strong: ({ node, ...props }) => <strong className="font-bold text-white bg-surface-400/50 px-1 rounded-md" {...props} />,
                        code: ({ node, inline, ...props }) =>
                            inline ? (
                                <code className="bg-surface-300 text-blue-300 px-2 py-1 rounded-md text-sm font-mono border border-surface-400" {...props} />
                            ) : (
                                <pre className="bg-surface-200 border border-surface-400 rounded-xl p-6 mb-6 overflow-x-auto shadow-sm">
                                    <code className="text-gray-300 text-sm font-mono leading-relaxed" {...props} />
                                </pre>
                            ),
                        a: ({ node, href, children, ...props }) => <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noreferrer" {...props}>{children}</a>
                    }}
                >
                    {content}
                </ReactMarkdown>
            </div>
        </div>
    );
};

const KnowledgeGraphViewer = ({ artifact, onProgressUpdate, onResourceClick }) => {
    const data = parseJsonContent(artifact.content);
    const progress = artifact.progress_state || { nodes: [] };
    const completedNodes = progress.nodes || [];

    const getStyledNodes = () => {
        return (data?.nodes || []).map(n => ({
            ...n,
            style: completedNodes.includes(n.id) 
                ? { backgroundColor: '#064e3b', borderColor: '#10b981', color: '#fff', borderRadius: '1rem', padding: '15px', fontWeight: 'bold' } 
                : { backgroundColor: '#1f2937', borderColor: '#4b5563', color: '#fff', borderRadius: '1rem', padding: '15px' }
        }));
    };

    const [nodes, setNodes] = useState(getStyledNodes());
    const [edges, setEdges] = useState(data?.edges || []);
    const [selectedNodeData, setSelectedNodeData] = useState(null);

    useEffect(() => {
        setNodes(getStyledNodes());
    }, [artifact.progress_state]);

    const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
    const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

    if (!data || !data.nodes) return <div className="p-6 text-red-400">Failed to parse Graph structure.</div>;

    const percent = Math.min(100, Math.round((completedNodes.length / (nodes.length || 1)) * 100));
    const toggleNodeCompletion = (nodeId) => {
        const newNodes = completedNodes.includes(nodeId) ? completedNodes.filter(id => id !== nodeId) : [...completedNodes, nodeId];
        onProgressUpdate(artifact.id, { ...progress, nodes: newNodes });
    };

    return (
        <div className="w-full h-full relative bg-surface-100 flex flex-col rounded-xl overflow-hidden">
            <div className="absolute top-0 w-full z-10 bg-surface-200/90 backdrop-blur-md border-b border-surface-400 p-3 flex items-center justify-between shadow-sm">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center">
                    <Network className="w-4 h-4 mr-2 text-purple-400" /> Map Mastery
                </span>
                <div className="flex items-center flex-1 max-w-md mx-6">
                    <div className="h-2 w-full bg-surface-400 rounded-xl overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-500 ease-out" style={{ width: `${percent}%` }}></div>
                    </div>
                </div>
                <span className="text-sm font-mono font-bold text-emerald-400">{percent}%</span>
            </div>

            <div className="flex-1 mt-12">
                <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_, node) => setSelectedNodeData({ ...node.data, id: node.id })} fitView className="dark">
                    <Background color="#374151" gap={16} />
                    <Controls className="bg-surface-300 fill-white border-surface-400 rounded-xl" />
                </ReactFlow>
            </div>

            <AnimatePresence>
                {selectedNodeData && (
                    <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="absolute top-0 right-0 w-full md:w-[450px] h-full bg-surface-200/95 backdrop-blur-xl border-l border-surface-400 shadow-2xl z-50 flex flex-col pt-12">
                        <div className="p-6 border-b border-surface-400 flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-1">{selectedNodeData.label}</h3>
                                <p className="text-purple-400 text-sm font-medium">{selectedNodeData.summary}</p>
                            </div>
                            <button onClick={() => setSelectedNodeData(null)} className="bg-surface-300 hover:bg-surface-400 p-2 rounded-xl text-gray-400 hover:text-white transition-colors shrink-0 cursor-pointer"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            <button onClick={() => toggleNodeCompletion(selectedNodeData.id)} className={`w-full mb-8 py-3 rounded-xl font-bold transition-all flex items-center justify-center cursor-pointer ${completedNodes.includes(selectedNodeData.id) ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800' : 'bg-surface-300 text-gray-300 border border-surface-400 hover:bg-surface-400'}`}>
                                {completedNodes.includes(selectedNodeData.id) ? <CheckCircle2 className="w-5 h-5 mr-2" /> : <Square className="w-5 h-5 mr-2" />}
                                {completedNodes.includes(selectedNodeData.id) ? 'Node Mastered' : 'Mark as Mastered'}
                            </button>
                            <div className="prose prose-invert prose-sm">
                                <h4 className="text-gray-500 uppercase tracking-widest text-xs font-bold mb-3">Deep Dive</h4>
                                <p className="text-gray-300 leading-relaxed text-sm mb-8 whitespace-pre-wrap">{selectedNodeData.details}</p>
                            </div>
                            {selectedNodeData.resources && selectedNodeData.resources.length > 0 && (
                                <div>
                                    <h4 className="text-gray-500 uppercase tracking-widest text-xs font-bold mb-3">Recommended Resources</h4>
                                    <div className="space-y-3">
                                        {selectedNodeData.resources.map((res, idx) => {
                                            const isPdf = res.link.toLowerCase().includes('.pdf') || res.type === 'pdf';
                                            return (
                                                <div key={idx} onClick={(e) => { e.stopPropagation(); onResourceClick && onResourceClick(res.link); }} className="group bg-surface-300 border border-surface-400 hover:border-purple-500/50 p-4 rounded-xl transition-colors cursor-pointer flex flex-col">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-semibold text-gray-200 text-sm group-hover:text-purple-300 transition-colors">{res.title}</span>
                                                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md border flex items-center ${!isPdf ? 'bg-blue-900/30 text-blue-400 border-blue-800' : 'bg-red-900/30 text-red-400 border-red-800'}`}>
                                                            {!isPdf ? <Video className="w-3 h-3 mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
                                                            {isPdf ? 'PDF' : 'Video'}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-gray-500 font-mono truncate">{res.link}</span>
                                                </div>
                                            );
                                        })}
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

const FlashcardsViewer = ({ content, onSwitchToQuiz, onReviewResult }) => {
    const cards = parseJsonContent(content);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [knownCards, setKnownCards] = useState(new Set());
    const [reviewCards, setReviewCards] = useState(new Set());

    if (!cards || !Array.isArray(cards)) return <div className="p-6 text-red-400">Failed to parse Flashcards.</div>;
    const currentCard = cards[currentIndex];
    const isNeedsReview = reviewCards.has(currentIndex);

    const markKnownAndNext = () => {
        onReviewResult(currentCard?.tag || "Concept", true);
        setKnownCards(prev => new Set(prev).add(currentIndex));
        setReviewCards(prev => { const s = new Set(prev); s.delete(currentIndex); return s; });
        nextCard();
    };

    const markReviewAndNext = () => {
        onReviewResult(currentCard?.tag || "Concept", false);
        setReviewCards(prev => new Set(prev).add(currentIndex));
        setKnownCards(prev => { const s = new Set(prev); s.delete(currentIndex); return s; });
        nextCard();
    };

    const nextCard = () => {
        setIsFlipped(false);
        setTimeout(() => { if (currentIndex < cards.length - 1) setCurrentIndex(prev => prev + 1); }, 150);
    };

    const prevCard = () => {
        setIsFlipped(false);
        setTimeout(() => { if (currentIndex > 0) setCurrentIndex(prev => prev - 1); }, 150);
    };

    const totalAttempted = knownCards.size + reviewCards.size;
    const progressPercentage = (totalAttempted / cards.length) * 100;
    const isComplete = totalAttempted === cards.length && cards.length > 0;

    return (
        <div className="flex flex-col items-center h-full p-8 bg-surface-100 rounded-xl relative">
            <div className="w-full max-w-2xl mb-10">
                <div className="flex justify-between text-xs font-mono text-gray-500 mb-2">
                    <span>STUDY SET PROGRESS</span>
                    <span className="flex space-x-4">
                        <span className="text-green-500">{knownCards.size} MASTERED</span>
                        <span className="text-red-400">{reviewCards.size} TO REVIEW</span>
                    </span>
                </div>
                <div className="h-2 w-full bg-surface-400 rounded-xl overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }} />
                </div>
                <div className="text-center mt-3 text-sm text-gray-400">Card {currentIndex + 1} of {cards.length}</div>
            </div>

            <div className="relative w-full max-w-2xl h-[400px] perspective-1000">
                <motion.div className="w-full h-full relative preserve-3d cursor-pointer" animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 260, damping: 20 }} onClick={() => setIsFlipped(!isFlipped)}>
                    <div className={`absolute w-full h-full backface-hidden bg-surface-200 border ${isNeedsReview ? 'border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-surface-400 hover:border-indigo-500/50'} rounded-xl p-10 flex flex-col items-center justify-center text-center shadow-md transition-colors`}>
                        <span className="absolute top-6 left-6 text-xs font-bold uppercase tracking-widest text-indigo-400 bg-indigo-900/30 px-3 py-1 rounded-md border border-indigo-800">{currentCard?.tag || "Concept"}</span>
                        {isNeedsReview && (
                            <span className="absolute top-6 right-6 text-xs font-bold uppercase tracking-widest text-red-400 bg-red-900/30 px-3 py-1 rounded-md border border-red-800 flex items-center">
                                <AlertCircle className="w-3 h-3 mr-1" /> Needs Review
                            </span>
                        )}
                        <HelpCircle className={`w-12 h-12 mb-6 ${isNeedsReview ? 'text-red-500/50' : 'text-gray-600'}`} />
                        <h2 className="text-3xl font-bold text-white leading-tight">{currentCard?.question}</h2>
                        <span className="absolute bottom-6 text-xs text-gray-500 font-mono animate-pulse flex items-center"><RotateCw className="w-4 h-4 mr-2" /> Click to reveal answer</span>
                    </div>

                    <div className="absolute w-full h-full backface-hidden bg-indigo-950/40 border border-indigo-700/50 rounded-xl p-10 flex flex-col justify-center shadow-md overflow-y-auto" style={{ transform: "rotateY(180deg)" }}>
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-4 flex items-center"><Sparkles className="w-4 h-4 mr-2" /> Answer</span>
                        <div className="text-lg text-gray-200 leading-relaxed">
                            {currentCard?.answer.split('\n').map((line, i) => <p key={i} className="mb-2">{line}</p>)}
                        </div>
                    </div>
                </motion.div>

                <AnimatePresence>
                    {isComplete && (
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 bg-surface-200/95 backdrop-blur-md rounded-xl z-50 flex flex-col items-center justify-center text-center p-10 border border-surface-400 shadow-xl">
                            <div className="bg-indigo-600 p-4 rounded-xl mb-6"><BookOpen className="w-10 h-10 text-white" /></div>
                            <h2 className="text-3xl font-bold text-white mb-3">Deck Complete!</h2>
                            <p className="text-gray-300 mb-8 max-w-sm">You have reviewed all the flashcards in this set. Are you ready to test your knowledge with the linked quiz?</p>
                            <div className="flex space-x-4">
                                <button onClick={() => { setKnownCards(new Set()); setReviewCards(new Set()); setCurrentIndex(0); }} className="px-6 py-3 bg-surface-300 hover:bg-surface-400 text-white font-bold rounded-xl transition-colors cursor-pointer">Study Again</button>
                                <button onClick={onSwitchToQuiz} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors flex items-center shadow-sm cursor-pointer"><CheckSquare className="w-5 h-5 mr-2" /> Take Quiz</button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="w-full max-w-2xl mt-10 flex items-center justify-between">
                <button onClick={prevCard} disabled={currentIndex === 0} className="px-6 py-3 bg-surface-300 hover:bg-surface-400 disabled:opacity-30 text-white font-medium rounded-xl transition-colors cursor-pointer">Previous</button>
                <div className="flex space-x-3">
                    <button onClick={markReviewAndNext} className="px-6 py-3 border border-red-800/50 text-red-400 hover:bg-red-900/30 font-medium rounded-xl transition-colors cursor-pointer">Needs Review</button>
                    <button onClick={markKnownAndNext} className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-xl flex items-center transition-colors shadow-sm cursor-pointer"><CheckCircle2 className="w-5 h-5 mr-2" /> Got It</button>
                    <button onClick={nextCard} disabled={currentIndex === cards.length - 1} className="px-6 py-3 bg-surface-300 hover:bg-surface-400 disabled:opacity-30 text-white font-medium rounded-xl transition-colors flex items-center cursor-pointer">Skip <ArrowRight className="w-4 h-4 ml-2" /></button>
                </div>
            </div>
        </div>
    );
};

const QuizViewer = ({ content, onReviewResult }) => {
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [score, setScore] = useState(0);
    const [isComplete, setIsComplete] = useState(false);

    const loadAndShuffleQuestions = useCallback(() => {
        const parsed = parseJsonContent(content);
        if (parsed && Array.isArray(parsed)) {
            const shuffled = parsed.map(q => ({ ...q, options: q.options ? [...q.options].sort(() => Math.random() - 0.5) : [] }));
            setQuestions(shuffled);
        }
    }, [content]);

    useEffect(() => { loadAndShuffleQuestions(); }, [loadAndShuffleQuestions]);

    if (!questions || questions.length === 0) return <div className="p-6 text-red-400">Failed to parse Quiz.</div>;
    const currentQ = questions[currentIndex];
    const checkIsCorrect = (opt) => String(opt).trim() === String(currentQ.correct_answer).trim();

    const handleSubmit = () => {
        setIsSubmitted(true);
        const isCorrect = checkIsCorrect(selectedOption);
        onReviewResult(currentQ?.tag || "Quiz Concept", isCorrect);
        if (isCorrect) setScore(s => s + 1);
    };

    const handleNext = () => {
        if (currentIndex < questions.length - 1) { setCurrentIndex(i => i + 1); setSelectedOption(null); setIsSubmitted(false); }
        else setIsComplete(true);
    };

    if (isComplete) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 bg-surface-100 rounded-xl">
                <div className="bg-surface-200 border border-surface-400 rounded-xl p-10 max-w-md w-full text-center shadow-sm">
                    <CheckSquare className="w-16 h-16 text-green-500 mx-auto mb-6" />
                    <h2 className="text-3xl font-bold text-white mb-2">Quiz Complete!</h2>
                    <p className="text-gray-400 mb-8">You scored {score} out of {questions.length}</p>
                    <div className="w-full bg-surface-400 rounded-xl h-4 mb-8 overflow-hidden">
                        <div className="bg-green-500 h-full transition-all" style={{ width: `${(score / questions.length) * 100}%` }}></div>
                    </div>
                    <button onClick={() => { loadAndShuffleQuestions(); setCurrentIndex(0); setScore(0); setIsComplete(false); setSelectedOption(null); setIsSubmitted(false); }} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-colors cursor-pointer">Retake Quiz</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center h-full p-8 bg-surface-100 overflow-y-auto rounded-xl">
            <div className="w-full max-w-3xl mb-8 flex justify-between items-center text-sm font-mono text-gray-500">
                <span>QUESTION {currentIndex + 1} OF {questions.length}</span>
                <span>SCORE: {score}</span>
            </div>
            <div className="w-full max-w-3xl bg-surface-200 border border-surface-400 rounded-xl p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-white mb-8">{currentQ.question}</h2>
                <div className="space-y-3 mb-8">
                    {currentQ.options.map((opt, idx) => {
                        let btnClass = "w-full text-left px-6 py-4 rounded-xl border transition-all text-base font-medium cursor-pointer ";
                        const isCorrect = checkIsCorrect(opt);
                        const isSelected = selectedOption === opt;

                        if (!isSubmitted) {
                            btnClass += isSelected ? "bg-blue-600/20 border-blue-500 text-blue-100" : "bg-surface-300 border-surface-400 hover:border-gray-500 text-gray-300";
                        } else {
                            if (isCorrect) btnClass += "bg-green-900/30 border-green-500 text-green-200";
                            else if (isSelected) btnClass += "bg-red-900/30 border-red-500 text-red-200";
                            else btnClass += "bg-surface-300 border-surface-400 text-gray-500 opacity-50 cursor-not-allowed";
                        }
                        return <button key={idx} disabled={isSubmitted} onClick={() => setSelectedOption(opt)} className={btnClass}>{opt}</button>;
                    })}
                </div>
                <AnimatePresence>
                    {isSubmitted && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`p-6 rounded-xl border mb-8 ${checkIsCorrect(selectedOption) ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'}`}>
                            <h3 className={`font-bold mb-2 flex items-center ${checkIsCorrect(selectedOption) ? 'text-green-400' : 'text-red-400'}`}>
                                {checkIsCorrect(selectedOption) ? <CheckCircle2 className="w-5 h-5 mr-2" /> : <X className="w-5 h-5 mr-2" />}
                                {checkIsCorrect(selectedOption) ? 'Correct!' : 'Incorrect'}
                            </h3>
                            <p className="text-gray-300 text-sm leading-relaxed">{currentQ.explanation}</p>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className="flex justify-end border-t border-surface-400 pt-6">
                    {!isSubmitted ? (
                        <button onClick={handleSubmit} disabled={!selectedOption} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-surface-400 disabled:text-gray-500 text-white font-bold rounded-xl transition-colors cursor-pointer">Check Answer</button>
                    ) : (
                        <button onClick={handleNext} className="px-8 py-3 bg-white hover:bg-gray-200 text-gray-900 font-bold rounded-xl transition-colors flex items-center cursor-pointer">{currentIndex < questions.length - 1 ? 'Next Question' : 'View Results'} <ArrowRight className="w-4 h-4 ml-2" /></button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function ArtifactsPanel({ workspaceId, onResourceClick, refreshKey }) {
    const [artifacts, setArtifacts] = useState([]);
    const [documents, setDocuments] = useState([]); 
    const [selectedDocs, setSelectedDocs] = useState([]); 

    const artifactTypeConfig = [
        { id: 'markdown', label: 'Guide', icon: FileText, activeClass: 'bg-blue-900/40 text-blue-400 border-blue-800/50 shadow-sm' },
        { id: 'graph', label: 'Map', icon: Network, activeClass: 'bg-purple-900/40 text-purple-400 border-purple-800/50 shadow-sm' },
        { id: 'flashcards', label: 'Cards', icon: CreditCard, activeClass: 'bg-indigo-900/40 text-indigo-400 border-indigo-800/50 shadow-sm' },
        { id: 'quiz', label: 'Quiz', icon: CheckSquare, activeClass: 'bg-emerald-900/40 text-emerald-400 border-emerald-800/50 shadow-sm' }
    ];
    const [selectedTypes, setSelectedTypes] = useState(artifactTypeConfig.map(t => t.id));
    const [isGenerating, setIsGenerating] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [title, setTitle] = useState('');
    const [viewingArtifact, setViewingArtifact] = useState(null);

    useEffect(() => { if (workspaceId) { fetchArtifacts(); fetchDocuments(); } }, [workspaceId, refreshKey]);

    const fetchArtifacts = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8000/api/artifacts/', { headers: { 'Authorization': `Token ${token}` } });
            if (response.ok) {
                const data = await response.json();
                setArtifacts(data.filter(a => a.workspace?.toString() === workspaceId?.toString()));
            }
        } catch (error) { console.error("Failed to fetch artifacts", error); }
    };

    const fetchDocuments = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/list_documents/`, { headers: { 'Authorization': `Token ${token}` } });
            if (response.ok) {
                const data = await response.json();
                setDocuments(data.documents || []);
                setSelectedDocs(data.documents.map(d => d.id.toString()));
            }
        } catch (error) { console.error("Failed to fetch documents", error); }
    };

    const handleProgressUpdate = async (artifactId, newProgress) => {
        setArtifacts(prev => prev.map(a => a.id === artifactId ? { ...a, progress_state: newProgress } : a));
        if (viewingArtifact?.id === artifactId) setViewingArtifact(prev => ({ ...prev, progress_state: newProgress }));
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`http://localhost:8000/api/artifacts/${artifactId}/update_progress/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` },
                body: JSON.stringify({ progress_state: newProgress })
            });
        } catch (error) { console.error("Failed to save progress", error); }
    };

    const handleReviewResult = async (artifactId, tag, correct) => {
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`http://localhost:8000/api/artifacts/${artifactId}/record_review/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` },
                body: JSON.stringify({ tag, correct })
            });
        } catch (error) { console.error("Failed to record review", error); }
    };

    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!prompt || selectedTypes.length === 0) return;
        setIsGenerating(true);
        try {
            const token = localStorage.getItem('auth_token');
            const baseTitle = title || 'Generated Study Set';
            const generatePromises = selectedTypes.map(type => 
                fetch(`http://localhost:8000/api/workspaces/${workspaceId}/generate_artifact/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` },
                    body: JSON.stringify({ prompt, title: baseTitle, artifact_type: type, selected_docs: selectedDocs })
                }).then(res => res.json())
            );
            const newArtifacts = await Promise.all(generatePromises);
            setArtifacts(prev => [...newArtifacts, ...prev]);
            setShowForm(false); setPrompt(''); setTitle('');
            if (newArtifacts.length > 0) setViewingArtifact(newArtifacts.find(a => a.artifact_type === 'flashcards') || newArtifacts[0]);
        } catch (error) { console.error("Failed to generate", error); } finally { setIsGenerating(false); }
    };

    const handleDeleteArtifact = async (e, id) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to permanently delete this artifact?')) return;
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`http://localhost:8000/api/artifacts/${id}/`, { method: 'DELETE', headers: { 'Authorization': `Token ${token}` } });
            if (response.ok || response.status === 204) {
                setArtifacts(prev => prev.filter(a => a.id !== id));
                if (viewingArtifact?.id === id) setViewingArtifact(null);
            }
        } catch (error) { console.error("Failed to delete", error); }
    };

    if (viewingArtifact) {
        const isGraph = viewingArtifact.artifact_type === 'graph';
        const isFlashcard = viewingArtifact.artifact_type === 'flashcards';
        const isQuiz = viewingArtifact.artifact_type === 'quiz';

        return (
            <div className="flex flex-col h-full bg-surface-200 rounded-xl border border-surface-400 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-surface-400 flex items-center justify-between bg-surface-300 z-10">
                    <button onClick={() => setViewingArtifact(null)} className="flex items-center text-gray-400 hover:text-white transition-colors text-sm font-medium bg-surface-400 px-3 py-1.5 rounded-md border border-surface-400 hover:border-gray-500 cursor-pointer">
                        <ChevronLeft className="w-4 h-4 mr-1" /> Back to Library
                    </button>
                    <div className="flex items-center">
                        {isGraph ? <Network className="w-5 h-5 text-purple-400 mr-3" /> : isFlashcard ? <CreditCard className="w-5 h-5 text-indigo-400 mr-3" /> : isQuiz ? <CheckSquare className="w-5 h-5 text-emerald-400 mr-3" /> : <FileText className="w-5 h-5 text-blue-500 mr-3" />}
                        <h3 className="text-white font-bold text-lg truncate max-w-md">{viewingArtifact.title}</h3>
                    </div>
                    <div className="w-24"></div>
                </div>
                <div className="flex-1 overflow-hidden relative">
                    {isGraph ? <KnowledgeGraphViewer artifact={viewingArtifact} onProgressUpdate={handleProgressUpdate} onResourceClick={onResourceClick} /> 
                    : isFlashcard ? <FlashcardsViewer content={viewingArtifact.content} onSwitchToQuiz={() => setViewingArtifact(artifacts.find(a => a.artifact_type === 'quiz' && (a.title === viewingArtifact.title.replace('Flashcards: ', 'Quiz: ') || a.title === viewingArtifact.title)))} onReviewResult={(tag, correct) => handleReviewResult(viewingArtifact.id, tag, correct)} /> 
                    : isQuiz ? <QuizViewer content={viewingArtifact.content} onReviewResult={(tag, correct) => handleReviewResult(viewingArtifact.id, tag, correct)} /> 
                    : <MarkdownViewer artifact={viewingArtifact} />}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-surface-200 rounded-xl border border-surface-400 overflow-hidden relative shadow-sm">
            <div className="p-5 border-b border-surface-400 flex items-center justify-between bg-surface-300">
                <h3 className="text-white font-bold flex items-center text-lg"><Sparkles className="w-5 h-5 text-blue-500 mr-3" /> Artifact Library</h3>
                <button onClick={() => setShowForm(!showForm)} className="flex items-center text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-xl transition-all shadow-sm cursor-pointer">
                    {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />} {showForm ? 'Cancel' : 'Generate New'}
                </button>
            </div>

            <div className="p-6 overflow-y-auto h-full bg-surface-100">
                {showForm && (
                    <form onSubmit={handleGenerate} className="bg-surface-200 p-6 rounded-xl border border-surface-400 mb-8 shadow-sm">
                        <div className="mb-4">
                            <div className="flex justify-between items-end mb-3">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Select Artifacts to Generate</label>
                                <button type="button" onClick={() => setSelectedTypes(selectedTypes.length === 4 ? [] : ['markdown', 'graph', 'flashcards', 'quiz'])} className="text-xs font-bold text-blue-500 hover:text-blue-400 cursor-pointer">
                                    {selectedTypes.length === 4 ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <div className="flex space-x-3 bg-surface-100 p-1.5 rounded-xl border border-surface-400">
                                {artifactTypeConfig.map(type => {
                                    const isSelected = selectedTypes.includes(type.id);
                                    const Icon = type.icon;
                                    return (
                                        <button key={type.id} type="button" onClick={() => setSelectedTypes(prev => prev.includes(type.id) ? prev.filter(t => t !== type.id) : [...prev, type.id])} className={`flex-1 py-2.5 text-xs font-bold rounded-md flex items-center justify-center transition-all cursor-pointer ${isSelected ? type.activeClass : 'text-gray-500 border border-transparent hover:bg-surface-400 hover:text-gray-300'}`}>
                                            <Icon className="w-3.5 h-3.5 mr-1.5" /> {type.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mb-6 mt-6">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">Filter Source Context</label>
                            <div className="max-h-32 overflow-y-auto bg-surface-100 border border-surface-400 rounded-xl p-3 space-y-1">
                                {documents.map(doc => (
                                    <label key={doc.id} className="flex items-center space-x-3 p-2 hover:bg-surface-300 rounded-md cursor-pointer text-sm text-gray-300 transition-colors">
                                        <input type="checkbox" checked={selectedDocs.includes(doc.id.toString())} onChange={(e) => { const idStr = doc.id.toString(); if(e.target.checked) setSelectedDocs([...selectedDocs, idStr]); else setSelectedDocs(selectedDocs.filter(id => id !== idStr)); }} className="w-4 h-4 rounded border-surface-400 text-blue-600 bg-surface-200 focus:ring-0 cursor-pointer" />
                                        <span className="truncate font-medium">{doc.name}</span>
                                    </label>
                                ))}
                                {documents.length === 0 && <span className="text-sm text-gray-600 italic px-2">No documents in workspace...</span>}
                            </div>
                        </div>

                        <input type="text" placeholder="Give your study set a title..." value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-surface-100 text-white placeholder-gray-600 px-4 py-3 rounded-xl border border-surface-400 focus:border-blue-500 focus:outline-none mb-4 text-base font-medium" />
                        <textarea placeholder="What specific topics should the AI synthesize?" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className="w-full bg-surface-100 text-white placeholder-gray-600 px-4 py-3 rounded-xl border border-surface-400 focus:border-blue-500 focus:outline-none mb-6 text-base resize-none" />
                        <button type="submit" disabled={isGenerating || !prompt || selectedTypes.length === 0} className="w-full bg-blue-600 hover:bg-blue-500 text-white disabled:bg-surface-400 disabled:text-gray-500 font-bold py-3.5 rounded-xl transition-colors flex justify-center items-center text-base shadow-sm cursor-pointer">
                            {isGenerating ? <><RotateCw className="w-5 h-5 mr-2 animate-spin" /> Synthesizing Knowledge...</> : `Generate Selected Artifacts (${selectedTypes.length})`}
                        </button>
                    </form>
                )}

                {artifacts.length === 0 && !showForm ? (
                    <EmptyState 
                        icon={Sparkles} 
                        title="Your library is empty." 
                        message="Generate a map, guide, or flashcards to get started." 
                        actionText="Generate New"
                        onAction={() => setShowForm(true)}
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {artifacts.map(artifact => (
                            <div key={artifact.id} onClick={() => setViewingArtifact(artifact)} className="bg-surface-200 hover:bg-surface-300 border border-surface-400 hover:border-gray-500 rounded-xl p-5 cursor-pointer transition-all flex flex-col group shadow-sm">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center overflow-hidden">
                                        <div className={`p-2 rounded-md mr-3 shrink-0 ${artifact.artifact_type === 'graph' ? 'bg-purple-900/30' : artifact.artifact_type === 'flashcards' ? 'bg-indigo-900/30' : artifact.artifact_type === 'quiz' ? 'bg-emerald-900/30' : 'bg-blue-900/30'}`}>
                                            {artifact.artifact_type === 'graph' ? <Network className="w-5 h-5 text-purple-400" /> : artifact.artifact_type === 'flashcards' ? <CreditCard className="w-5 h-5 text-indigo-400" /> : artifact.artifact_type === 'quiz' ? <CheckSquare className="w-5 h-5 text-emerald-400" /> : <FileText className="w-5 h-5 text-blue-500" />}
                                        </div>
                                        <span className="text-gray-100 font-bold text-base truncate">{artifact.title}</span>
                                    </div>
                                    <button onClick={(e) => handleDeleteArtifact(e, artifact.id)} className="text-gray-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-900/30 transition-colors shrink-0 cursor-pointer" title="Delete Artifact"><Trash2 className="w-4 h-4" /></button>
                                </div>
                                <div className="flex justify-between items-center mt-auto">
                                    <span className="text-xs font-mono text-gray-500 uppercase">{artifact.artifact_type}</span>
                                    <span className="text-xs font-semibold text-gray-400 bg-surface-400 px-2 py-1 rounded group-hover:bg-white group-hover:text-black transition-colors">Open</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}