import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Network, X, Video, FileText, Activity, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ReactFlow, Controls, Background, applyNodeChanges, applyEdgeChanges, MarkerType, Handle, Position } from '@xyflow/react';
import { forceSimulation, forceManyBody, forceCenter, forceLink, forceCollide } from 'd3-force';
import '@xyflow/react/dist/style.css';

export default function CortexPanel({ workspaceId, onResourceClick }) {
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [selectedNodeData, setSelectedNodeData] = useState(null);
    const [cortexStats, setCortexStats] = useState({ total: 0, mastered: 0, review: 0, new: 0 });
    const prefersReducedMotion = useReducedMotion();

    const currentNodesRef = useRef([]);
    const currentEdgesRef = useRef([]);

    const loadCortex = async (forceUpdate = false) => {
        try {
            const token = localStorage.getItem('auth_token');
            const [graphRes, pathRes] = await Promise.all([
                fetch(`http://localhost:8000/api/workspaces/${workspaceId}/graph/`, { headers: { 'Authorization': `Token ${token}` } }),
                fetch(`http://localhost:8000/api/workspaces/${workspaceId}/recommended_path/`, { headers: { 'Authorization': `Token ${token}` } })
            ]);
            
            if (graphRes.ok && pathRes.ok) {
                const gData = await graphRes.json();
                const pData = await pathRes.json();

                let mCount = 0, rCount = 0, nCount = 0;

                const styledNodes = gData.nodes.map(n => {
                    const isNew = (Date.now() - new Date(n.data.updated_at).getTime()) < 3600000;
                    const isOnPath = pData.path.map(String).includes(n.id);
                    const isMastered = n.data.mastery_state === 'mastered';
                    const isWeak = n.data.mastery_state === 'weak';

                    if (isMastered) mCount++;
                    else if (isWeak) rCount++;
                    else if (isNew) nCount++;

                    // Dynamic Node Coloring based on State
                    let bg = '#1f2937', border = '#4b5563'; 
                    if (isMastered) { bg = '#064e3b'; border = '#10b981'; } // Green for Done
                    else if (isWeak) { bg = '#450a0a'; border = '#ef4444'; } // Red for Review
                    else if (isNew) { bg = '#1e3a8a'; border = '#3b82f6'; } // Blue for New

                    return {
                        ...n,
                        style: { 
                            backgroundColor: bg, borderColor: border, borderWidth: '2px', 
                            color: '#fff', borderRadius: '1rem', padding: '15px', 
                            boxShadow: isOnPath ? `0 0 15px ${border}80` : '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
                            zIndex: 100 // Keeps nodes strictly above edges
                        },
                        data: { ...n.data, isNew, isMastered, isWeak, isOnPath }
                    };
                });

                setCortexStats({ total: gData.nodes.length, mastered: mCount, review: rCount, new: nCount });

                if (forceUpdate || gData.nodes.length !== currentNodesRef.current.length || gData.edges.length !== currentEdgesRef.current.length) {
                    const now = Date.now();
                    const styledEdges = gData.edges.map(e => {
                        const isPrereq = e.type === 'prerequisite';
                        return {
                            ...e,
                            type: 'default', // Soft bezier curves
                            animated: false,
                            style: { 
                                strokeWidth: 1.5, 
                                stroke: isPrereq ? '#6b7280' : '#4b5563', 
                                opacity: 0.3, // Softens the spaghetti look
                                strokeDasharray: isPrereq ? 'none' : '4,4' 
                            },
                        };
                    });

                    const d3Links = styledEdges.map(e => ({ source: e.source, target: e.target, id: e.id }));

                    const simulation = forceSimulation(styledNodes)
                        .force('charge', forceManyBody().strength(-2000))
                        .force('center', forceCenter(window.innerWidth / 2, window.innerHeight / 2.5))
                        .force('link', forceLink(d3Links).id(d => d.id).distance(250))
                        .force('collide', forceCollide().radius(120))
                        .stop();

                    for (let i = 0; i < 200; i++) simulation.tick();

                    const positionedNodes = styledNodes.map(n => ({
                        ...n, position: { x: n.x || 0, y: n.y || 0 }
                    }));

                    currentNodesRef.current = positionedNodes;
                    currentEdgesRef.current = styledEdges;

                    setNodes(positionedNodes);
                    setEdges(styledEdges);
                } else {
                    // Update styles without moving nodes if only data changed
                    setNodes(prevNodes => prevNodes.map(pn => {
                        const updatedNode = styledNodes.find(sn => sn.id === pn.id);
                        return updatedNode ? { ...pn, style: updatedNode.style, data: updatedNode.data } : pn;
                    }));
                }
            }
        } catch (err) {
            console.error("Graph Sync Error:", err);
        }
    };

    useEffect(() => {
        if (!workspaceId) return;
        loadCortex(true);
        const intervalId = setInterval(() => loadCortex(false), 5000);
        return () => clearInterval(intervalId);
    }, [workspaceId]);

    const handleMasteryUpdate = async (tag, isCorrect) => {
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/record_mastery/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` },
                body: JSON.stringify({ tag: tag, correct: isCorrect })
            });
            loadCortex(false); // Instantly refresh colors
            if (selectedNodeData) {
                setSelectedNodeData(prev => ({ ...prev, isMastered: isCorrect, isWeak: !isCorrect }));
            }
        } catch (error) {
            console.error("Failed to update mastery:", error);
        }
    };

    const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
    const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

    const customNodeTypes = useMemo(() => ({
        default: ({ data }) => (
            <div className="relative">
                <Handle type="target" position={Position.Top} className="opacity-0 border-none" />
                <Handle type="source" position={Position.Bottom} className="opacity-0 border-none" />
                <div className="font-bold text-sm mb-1">{data.label}</div>
                <div className="text-xs text-gray-300 line-clamp-2">{data.summary}</div>
            </div>
        )
    }), []);

    if (nodes.length === 0) return (
        <div className="flex flex-col h-full items-center justify-center p-8 bg-surface-100 rounded-xl">
            <Activity className="w-8 h-8 mb-4 text-blue-500 animate-pulse" />
            <div className="text-gray-500 font-mono text-sm uppercase mb-2">Initializing Neural Substrate...</div>
        </div>
    );

    return (
        <div className="w-full h-full relative bg-surface-100 flex flex-col rounded-xl overflow-hidden shadow-sm border border-surface-400">
            {/* Global Progress Bar */}
            <div className="absolute top-0 w-full z-20 bg-surface-200/95 backdrop-blur-md border-b border-surface-400 p-4 shadow-md">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-300 tracking-widest uppercase flex items-center">
                        <Activity className="w-4 h-4 mr-2 text-blue-500" /> Cortex State
                    </span>
                    <span className="text-xs font-mono text-gray-400">
                        {cortexStats.total} Concepts Extracted
                    </span>
                </div>
                <div className="w-full h-2 bg-surface-400 rounded-full overflow-hidden flex">
                    <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${(cortexStats.mastered / cortexStats.total) * 100}%` }} title="Mastered"></div>
                    <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${(cortexStats.new / cortexStats.total) * 100}%` }} title="New"></div>
                    <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${(cortexStats.review / cortexStats.total) * 100}%` }} title="Needs Review"></div>
                </div>
            </div>

            <div className="flex-1 mt-16 z-10">
                <ReactFlow 
                    nodes={nodes} edges={edges} nodeTypes={customNodeTypes} 
                    onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} 
                    onNodeClick={(_, node) => setSelectedNodeData({ ...node.data, id: node.id })} 
                    fitView className="dark"
                >
                    <Background color="#374151" gap={20} />
                    <Controls className="bg-surface-300 fill-white border-surface-400 rounded-xl" />
                </ReactFlow>
            </div>

            <AnimatePresence>
                {selectedNodeData && (
                    <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="absolute top-0 right-0 w-full md:w-[450px] h-full bg-surface-200/95 backdrop-blur-xl border-l border-surface-400 shadow-2xl z-50 flex flex-col pt-16">
                        <div className="p-6 border-b border-surface-400 flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-2">{selectedNodeData.label}</h3>
                                <p className="text-gray-400 text-sm">{selectedNodeData.summary}</p>
                            </div>
                            <button onClick={() => setSelectedNodeData(null)} className="bg-surface-300 hover:bg-surface-400 p-2 rounded-xl text-gray-400 hover:text-white transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
                        </div>
                        
                        {/* Interactive Mastery Actions */}
                        <div className="p-4 bg-surface-300/50 border-b border-surface-400 flex space-x-3">
                            <button onClick={() => handleMasteryUpdate(selectedNodeData.label, true)} className="flex-1 py-2 bg-green-900/30 hover:bg-green-800/50 text-green-400 border border-green-800 rounded-lg text-sm font-bold flex justify-center items-center transition-colors cursor-pointer">
                                <CheckCircle className="w-4 h-4 mr-2" /> Mark Mastered
                            </button>
                            <button onClick={() => handleMasteryUpdate(selectedNodeData.label, false)} className="flex-1 py-2 bg-red-900/30 hover:bg-red-800/50 text-red-400 border border-red-800 rounded-lg text-sm font-bold flex justify-center items-center transition-colors cursor-pointer">
                                <AlertTriangle className="w-4 h-4 mr-2" /> Needs Review
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-8">
                            <div className="prose prose-invert prose-sm">
                                <h4 className="text-gray-500 uppercase tracking-widest text-xs font-bold mb-2">Deep Dive</h4>
                                <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{selectedNodeData.details}</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}