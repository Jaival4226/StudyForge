import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Network, X, Video, FileText, Activity, CheckCircle, AlertTriangle, Filter } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ReactFlow, Controls, Background, applyNodeChanges, applyEdgeChanges, MarkerType, Handle, Position } from '@xyflow/react';
import { forceSimulation, forceManyBody, forceCenter, forceLink, forceCollide } from 'd3-force';
import '@xyflow/react/dist/style.css';

export default function CortexPanel({ workspaceId, onResourceClick }) {
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [selectedNodeData, setSelectedNodeData] = useState(null);
    const [cortexStats, setCortexStats] = useState({ total: 0, mastered: 0, review: 0, new: 0 });
    
    const [selectedDocFilter, setSelectedDocFilter] = useState('ALL');

    const currentNodesRef = useRef([]);
    const currentEdgesRef = useRef([]);
    
    const localMasteryOverrides = useRef({}); 

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
                    
                    const backendState = n.data.mastery_state;
                    const localState = localMasteryOverrides.current[n.data.label];
                    const finalState = localState || backendState;

                    const isMastered = finalState === 'mastered';
                    const isWeak = finalState === 'weak';

                    if (isMastered) mCount++;
                    else if (isWeak) rCount++;
                    else if (isNew) nCount++;

                    // AESTHETIC LIGHT THEME COLORS FOR GRAPH NODES
                    let bg = '#ffffff', border = '#cbd5e1', textColor = '#3b0764'; 
                    if (isMastered) { bg = '#f0fdf4'; border = '#4ade80'; textColor = '#166534'; } 
                    else if (isWeak) { bg = '#fef2f2'; border = '#f87171'; textColor = '#991b1b'; } 
                    else if (isNew) { bg = '#faf5ff'; border = '#c084fc'; textColor = '#6b21a8'; } 

                    return {
                        ...n,
                        style: { 
                            backgroundColor: bg, borderColor: border, borderWidth: '2px', 
                            color: textColor, borderRadius: '1rem', padding: '15px', 
                            boxShadow: isOnPath ? `0 0 15px ${border}80` : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            zIndex: 100 
                        },
                        data: { ...n.data, isNew: !isMastered && !isWeak && isNew, isMastered, isWeak, isOnPath }
                    };
                });

                setCortexStats({ total: gData.nodes.length, mastered: mCount, review: rCount, new: nCount });

                if (forceUpdate || gData.nodes.length !== currentNodesRef.current.length || gData.edges.length !== currentEdgesRef.current.length) {
                    const styledEdges = gData.edges.map(e => {
                        const isPrereq = e.type === 'prerequisite';
                        return {
                            ...e,
                            type: 'default', 
                            animated: false,
                            style: { 
                                strokeWidth: 1.5, 
                                stroke: isPrereq ? '#94a3b8' : '#cbd5e1', 
                                opacity: 0.6, 
                                strokeDasharray: isPrereq ? 'none' : '4,4' 
                            },
                        };
                    });

                    const d3Links = styledEdges.map(e => ({ source: e.source, target: e.target, id: e.id }));

                    const simulation = forceSimulation(styledNodes)
                        .force('charge', forceManyBody().strength(-2000)) 
                        .force('center', forceCenter(window.innerWidth / 2, window.innerHeight / 2))
                        .force('link', forceLink(d3Links).id(d => d.id).distance(250))
                        .force('collide', forceCollide().radius(120).iterations(8)) 
                        .stop();

                    for (let i = 0; i < 500; i++) simulation.tick();

                    const positionedNodes = styledNodes.map(n => ({
                        ...n, position: { x: n.x || 0, y: n.y || 0 }
                    }));

                    currentNodesRef.current = positionedNodes;
                    currentEdgesRef.current = styledEdges;

                    setNodes(positionedNodes);
                    setEdges(styledEdges);
                } else {
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
        localMasteryOverrides.current = {}; 
        setSelectedDocFilter('ALL');
        loadCortex(true);
        const intervalId = setInterval(() => loadCortex(false), 5000);
        return () => clearInterval(intervalId);
    }, [workspaceId]);

    const handleMasteryUpdate = async (tag, isCorrect) => {
        try {
            const token = localStorage.getItem('auth_token');
            
            localMasteryOverrides.current[tag] = isCorrect ? 'mastered' : 'weak';
            
            setNodes(prevNodes => {
                let mCount = 0, rCount = 0, nCount = 0;
                
                const newNodes = prevNodes.map(n => {
                    let isMastered = n.data.isMastered;
                    let isWeak = n.data.isWeak;
                    let isNew = n.data.isNew;

                    if (selectedNodeData && n.id === selectedNodeData.id) {
                        isMastered = isCorrect;
                        isWeak = !isCorrect;
                        isNew = false;
                        
                        const bg = isCorrect ? '#f0fdf4' : '#fef2f2';
                        const border = isCorrect ? '#4ade80' : '#f87171';
                        const textColor = isCorrect ? '#166534' : '#991b1b';
                        
                        if (isMastered) mCount++;
                        else if (isWeak) rCount++;
                        else if (isNew) nCount++;

                        return {
                            ...n,
                            style: { 
                                ...n.style, 
                                backgroundColor: bg, 
                                borderColor: border,
                                color: textColor,
                                boxShadow: n.data.isOnPath ? `0 0 15px ${border}80` : '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                            },
                            data: { ...n.data, isMastered, isWeak, isNew }
                        };
                    }

                    if (isMastered) mCount++;
                    else if (isWeak) rCount++;
                    else if (isNew) nCount++;

                    return n;
                });
                
                setCortexStats(prev => ({ ...prev, mastered: mCount, review: rCount, new: nCount }));
                return newNodes;
            });

            if (selectedNodeData) {
                setSelectedNodeData(prev => ({ ...prev, isMastered: isCorrect, isWeak: !isCorrect, isNew: false }));
            }

            await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/record_mastery/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` },
                body: JSON.stringify({ tag: tag, correct: isCorrect })
            });
            
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
                <div className="text-xs opacity-70 line-clamp-2">{data.summary}</div>
            </div>
        )
    }), []);

    const uniqueDocs = useMemo(() => {
        const docs = new Set();
        nodes.forEach(n => {
            if (n.data.resources) {
                n.data.resources.forEach(r => docs.add(r.title));
            }
        });
        return Array.from(docs);
    }, [nodes]);

    const filteredNodes = useMemo(() => {
        if (selectedDocFilter === 'ALL') return nodes;
        return nodes.filter(n => n.data.resources?.some(r => r.title === selectedDocFilter));
    }, [nodes, selectedDocFilter]);

    const filteredEdges = useMemo(() => {
        if (selectedDocFilter === 'ALL') return edges;
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        return edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    }, [edges, filteredNodes]);

    if (nodes.length === 0) return (
        <div className="flex flex-col h-full items-center justify-center p-8 bg-surface-100 rounded-xl">
            <Activity className="w-8 h-8 mb-4 text-blue-500 animate-pulse" />
            <div className="text-gray-500 font-mono text-sm uppercase mb-2">Initializing Neural Substrate...</div>
        </div>
    );

    return (
        <div className="w-full h-full relative bg-white flex flex-col rounded-xl overflow-hidden shadow-sm border border-surface-400">
            <div className="absolute top-0 w-full z-20 bg-white/90 backdrop-blur-md border-b border-surface-400 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-500 tracking-widest uppercase flex items-center">
                        <Activity className="w-4 h-4 mr-2 text-purple-600" /> Cortex State
                    </span>
                    
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center bg-surface-100 rounded-md border border-surface-400 px-2 overflow-hidden">
                            <Filter className="w-3 h-3 text-gray-400 mr-2" />
                            <select
                                value={selectedDocFilter}
                                onChange={(e) => setSelectedDocFilter(e.target.value)}
                                className="bg-transparent text-xs font-bold text-gray-500 py-1.5 focus:outline-none cursor-pointer max-w-[200px] truncate"
                            >
                                <option value="ALL">All Documents (Merged)</option>
                                {uniqueDocs.map((doc, idx) => (
                                    <option key={idx} value={doc}>{doc}</option>
                                ))}
                            </select>
                        </div>
                        <span className="text-xs font-mono text-gray-400">
                            {filteredNodes.length} Concepts
                        </span>
                    </div>
                </div>
                <div className="w-full h-2 bg-surface-400 rounded-full overflow-hidden flex">
                    <div className="h-full bg-green-400 transition-all duration-500" style={{ width: `${(cortexStats.mastered / cortexStats.total) * 100}%` }} title="Mastered"></div>
                    <div className="h-full bg-purple-400 transition-all duration-500" style={{ width: `${(cortexStats.new / cortexStats.total) * 100}%` }} title="New"></div>
                    <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${(cortexStats.review / cortexStats.total) * 100}%` }} title="Needs Review"></div>
                </div>
            </div>

            <div className="flex-1 mt-16 z-10">
                <ReactFlow 
                    nodes={filteredNodes} 
                    edges={filteredEdges} 
                    nodeTypes={customNodeTypes} 
                    onNodesChange={onNodesChange} 
                    onEdgesChange={onEdgesChange} 
                    onNodeClick={(_, node) => setSelectedNodeData({ ...node.data, id: node.id })} 
                    fitView 
                    minZoom={0.05} 
                    maxZoom={2}
                >
                    <Background color="#cbd5e1" gap={20} />
                    <Controls className="bg-white fill-gray-600 border-surface-400 rounded-xl shadow-sm" />
                </ReactFlow>
            </div>

            <AnimatePresence>
                {selectedNodeData && (
                    <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="absolute top-0 right-0 w-full md:w-[450px] h-full bg-white/95 backdrop-blur-xl border-l border-surface-400 shadow-2xl z-50 flex flex-col pt-16">
                        <div className="p-6 border-b border-surface-400 flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-2">{selectedNodeData.label}</h3>
                                <p className="text-gray-600 text-sm">{selectedNodeData.summary}</p>
                            </div>
                            <button onClick={() => setSelectedNodeData(null)} className="bg-surface-100 hover:bg-surface-300 border border-surface-400 p-2 rounded-xl text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
                        </div>
                        
                        <div className="p-4 bg-surface-100 border-b border-surface-400 flex space-x-3">
                            <button onClick={() => handleMasteryUpdate(selectedNodeData.label, true)} className="flex-1 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-sm font-bold flex justify-center items-center transition-colors cursor-pointer">
                                <CheckCircle className="w-4 h-4 mr-2" /> Mark Mastered
                            </button>
                            <button onClick={() => handleMasteryUpdate(selectedNodeData.label, false)} className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-bold flex justify-center items-center transition-colors cursor-pointer">
                                <AlertTriangle className="w-4 h-4 mr-2" /> Needs Review
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-8">
                            <div className="prose prose-sm">
                                <h4 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-2">Deep Dive</h4>
                                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedNodeData.details}</p>
                            </div>

                            {selectedNodeData.resources && selectedNodeData.resources.length > 0 && (
                                <div className="mt-6 border-t border-surface-400 pt-4 pb-6">
                                    <h4 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-3">Source Media</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedNodeData.resources.map((res, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => { onResourceClick(res.source_tag); }}
                                                className={`inline-flex items-center px-3 py-2 rounded-md text-xs font-bold transition-colors shadow-sm cursor-pointer border ${res.type === 'video' ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}
                                            >
                                                {res.type === 'video' ? <Video className="w-4 h-4 mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                                                {res.title}
                                            </button>
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
}