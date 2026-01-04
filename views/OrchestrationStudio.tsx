
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { WorkflowNode, WorkflowEdge, NodeType, Language } from '../types';
import { translations } from '../utils/translations';
import { MOCK_AGENTS } from '../constants';
import { generateWorkflow, generateAgentResponse } from '../services/geminiService';
import { 
    Bot, GitBranch, Terminal, 
    Trash2, Rocket, X, 
    BrainCircuit, Database, Code, Play, ArrowLeft, Search, Split, Plus,
    AlertCircle, MousePointer2, Layers, Zap, User as UserIcon, Sparkles, Loader2, PlayCircle, Send, CheckCircle, Clock
} from 'lucide-react';

interface OrchestrationStudioProps {
  language: Language;
  onBack: () => void;
  onDeploy: (nodes: WorkflowNode[]) => void;
  existingNodes?: WorkflowNode[];
  agents?: Agent[];
}

// Helper for Bezier Curve
const getEdgePath = (sourceX: number, sourceY: number, targetX: number, targetY: number) => {
    if (Number.isNaN(sourceX) || Number.isNaN(sourceY) || Number.isNaN(targetX) || Number.isNaN(targetY)) return '';
    const deltaX = Math.abs(targetX - sourceX);
    const controlPointX = Math.max(deltaX * 0.5, 60);
    return `M${sourceX},${sourceY} C${sourceX + controlPointX},${sourceY} ${targetX - controlPointX},${targetY} ${targetX},${targetY}`;
};

const OrchestrationStudio: React.FC<OrchestrationStudioProps> = ({ language, onBack, onDeploy, existingNodes, agents: propAgents }) => {
  // Use casting to bypass TS strict property check if studio is missing from one translation variant locally but exists at runtime
  const t = (translations[language] as any)?.studio || (translations['en'] as any).studio;
  const canvasRef = useRef<HTMLDivElement>(null);

  // 使用传入的agents或MOCK_AGENTS作为后备
  const agents = propAgents || MOCK_AGENTS;

  // --- State ---
  const [nodes, setNodes] = useState<WorkflowNode[]>(existingNodes || [
      { id: 'start', type: 'start', position: { x: 100, y: 300 }, data: { label: t.tools.start, description: 'Triggered on user message' } }
  ]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  
  // Selection & Tools
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  
  // Linking State
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);
  const [linkingSourceHandle, setLinkingSourceHandle] = useState<string | null>(null); 
  const [tempEdgeEnd, setTempEdgeEnd] = useState<{ x: number, y: number } | null>(null);
  
  // Menu State
  const [nodeMenu, setNodeMenu] = useState<{ x: number, y: number, sourceId: string | null, handleLabel?: string } | null>(null);
  const [menuSearch, setMenuSearch] = useState('');

  // AI Generator State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // --- TEST RUN STATE ---
  const [isTestMode, setIsTestMode] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [executionLog, setExecutionLog] = useState<{id: string, type: 'info' | 'output' | 'error' | 'user', content: string, nodeId?: string}[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const NODE_WIDTH = 260;

  // --- Helpers ---
  const getNodeStyles = (type: NodeType) => {
    switch(type) {
        case 'start': return { border: 'border-emerald-500', bg: 'bg-emerald-500/10', iconBg: 'bg-emerald-500', glow: 'shadow-emerald-500/20' };
        case 'end': return { border: 'border-slate-500', bg: 'bg-slate-500/10', iconBg: 'bg-slate-500', glow: 'shadow-slate-500/20' };
        case 'llm': return { border: 'border-violet-500', bg: 'bg-violet-500/10', iconBg: 'bg-violet-500', glow: 'shadow-violet-500/20' };
        case 'retrieval': return { border: 'border-amber-500', bg: 'bg-amber-500/10', iconBg: 'bg-amber-500', glow: 'shadow-amber-500/20' };
        case 'code': return { border: 'border-pink-500', bg: 'bg-pink-500/10', iconBg: 'bg-pink-500', glow: 'shadow-pink-500/20' };
        case 'condition': return { border: 'border-cyan-500', bg: 'bg-cyan-500/10', iconBg: 'bg-cyan-500', glow: 'shadow-cyan-500/20' };
        case 'agent': return { border: 'border-blue-500', bg: 'bg-blue-500/10', iconBg: 'bg-blue-500', glow: 'shadow-blue-500/20' };
        case 'classifier': return { border: 'border-orange-500', bg: 'bg-orange-500/10', iconBg: 'bg-orange-500', glow: 'shadow-orange-500/20' };
        case 'user_profile': return { border: 'border-indigo-500', bg: 'bg-indigo-500/10', iconBg: 'bg-indigo-500', glow: 'shadow-indigo-500/20' };
        default: return { border: 'border-gray-500', bg: 'bg-gray-500/10', iconBg: 'bg-gray-500', glow: 'shadow-gray-500/20' };
    }
  };

  const getNodeIcon = (type: NodeType) => {
    switch(type) {
        case 'start': return <Play size={16} className="text-white fill-white ml-0.5" />;
        case 'end': return <Terminal size={16} className="text-white" />;
        case 'llm': return <BrainCircuit size={16} className="text-white" />;
        case 'retrieval': return <Database size={16} className="text-white" />;
        case 'code': return <Code size={16} className="text-white" />;
        case 'condition': return <GitBranch size={16} className="text-white" />;
        case 'agent': return <Bot size={16} className="text-white" />;
        case 'classifier': return <Split size={16} className="text-white" />;
        case 'user_profile': return <UserIcon size={16} className="text-white" />;
        default: return <Zap size={16} className="text-white" />;
    }
  };

  const getNodeTitle = (type: NodeType) => {
      switch(type) {
          case 'start': return t.tools.start;
          case 'end': return t.tools.end;
          case 'llm': return t.tools.llm;
          case 'retrieval': return t.tools.retrieval;
          case 'code': return t.tools.code;
          case 'condition': return t.tools.condition;
          case 'agent': return t.tools.agent;
          case 'classifier': return t.tools.classifier;
          case 'user_profile': return t.tools.user_profile;
          default: return 'Node';
      }
  };

  // --- Workflow Execution Logic ---
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const logExecution = (content: string, type: 'info' | 'output' | 'error' | 'user' = 'info', nodeId?: string) => {
      setExecutionLog(prev => [...prev, { id: Date.now().toString(), type, content, nodeId }]);
      // Auto scroll
      setTimeout(() => {
          if (logContainerRef.current) {
              logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
      }, 50);
  };

  const runWorkflow = async () => {
      if (!testInput.trim()) return;
      
      setIsExecuting(true);
      setActiveNodeId(null);
      setActiveEdgeId(null);
      setExecutionLog([]); // Clear previous run
      
      logExecution(testInput, 'user');
      logExecution('Starting workflow execution...', 'info');

      // 1. Find Start Node
      let currentNode = nodes.find(n => n.type === 'start');
      if (!currentNode) {
          logExecution('Error: No Start Node found.', 'error');
          setIsExecuting(false);
          return;
      }

      // Execution Context
      let context: any = { 
          input: testInput,
          user_profile: { name: 'Demo User', role: 'Tester', industry: 'SaaS' } // Mock Profile
      };

      try {
          while (currentNode) {
              setActiveNodeId(currentNode.id);
              logExecution(`Executing: ${currentNode.data.label} (${currentNode.type})`, 'info', currentNode.id);
              await delay(800); // Visual delay

              // Process Node Logic
              let outputResult: any = null;
              let nextEdgeLabel: string | undefined = undefined;

              if (currentNode.type === 'start') {
                  outputResult = context.input;
              } 
              else if (currentNode.type === 'llm' || currentNode.type === 'agent') {
                  const prompt = currentNode.data.systemPrompt || 'You are a helpful assistant.';
                  // If it's an agent node, try to use agent specific prompt
                  let finalPrompt = prompt;
                  if (currentNode.type === 'agent' && currentNode.data.agentId) {
                      const agent = agents.find(a => a.id === currentNode.data.agentId);
                      if (agent) finalPrompt = agent.systemPrompt;
                  }
                  
                  // Replace variables in prompt
                  const populatedPrompt = finalPrompt.replace('{{input}}', context.input)
                                                     .replace('{{context}}', JSON.stringify(context))
                                                     .replace('{{user_profile}}', JSON.stringify(context.user_profile));

                  logExecution(`Calling Model...`, 'info', currentNode.id);
                  const response = await generateAgentResponse(populatedPrompt + `\n\nUser Input: ${context.input}`, '', () => {});
                  outputResult = response;
                  context.last_output = outputResult;
                  logExecution(`Output: ${outputResult.substring(0, 100)}...`, 'output', currentNode.id);
              }
              else if (currentNode.type === 'condition') {
                  const val = context.input; // Simplification: always check input
                  const checkVal = currentNode.data.value || '';
                  let passed = false;
                  
                  if (currentNode.data.operator === 'contains') passed = val.toLowerCase().includes(checkVal.toLowerCase());
                  else if (currentNode.data.operator === 'equals') passed = val === checkVal;
                  else if (currentNode.data.operator === 'empty') passed = !val;

                  outputResult = passed;
                  nextEdgeLabel = passed ? 'True' : 'False';
                  logExecution(`Condition result: ${passed}`, 'output', currentNode.id);
              }
              else if (currentNode.type === 'classifier') {
                  // Simplified Classifier: Call LLM to pick one intent
                  const intents = currentNode.data.intents || ['Default'];
                  const prompt = `Classify the user input: "${context.input}" into exactly one of these categories: ${intents.join(', ')}. Return ONLY the category name.`;
                  const classification = await generateAgentResponse(prompt, '', () => {});
                  
                  // Find best match
                  const matched = intents.find(i => classification.includes(i)) || intents[0];
                  nextEdgeLabel = matched;
                  logExecution(`Classified as: ${matched}`, 'output', currentNode.id);
              }
              else if (currentNode.type === 'end') {
                  logExecution('Workflow Finished.', 'info');
                  logExecution(context.last_output || context.input, 'output', currentNode.id);
                  break; // Stop
              }

              // Find Next Edge
              const edgesFromNode = edges.filter(e => e.source === currentNode!.id);
              let nextEdge: WorkflowEdge | undefined;

              if (nextEdgeLabel) {
                  nextEdge = edgesFromNode.find(e => e.label === nextEdgeLabel);
              } else {
                  // Default to first edge if no label logic
                  nextEdge = edgesFromNode[0];
              }

              if (nextEdge) {
                  setActiveEdgeId(nextEdge.id);
                  await delay(600); // Edge traversal visual
                  currentNode = nodes.find(n => n.id === nextEdge!.target);
                  setActiveEdgeId(null);
              } else {
                  currentNode = undefined; // Dead end
                  if (nodes.find(n => n.id === activeNodeId)?.type !== 'end') {
                      logExecution('End of path reached (No connecting edge).', 'info');
                  }
              }
          }
      } catch (err) {
          console.error(err);
          logExecution('Execution Error occurred.', 'error');
      } finally {
          setIsExecuting(false);
          setActiveNodeId(null);
          setActiveEdgeId(null);
      }
  };

  // --- Interaction Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
          setIsPanning(true);
          setLastMousePos({ x: e.clientX, y: e.clientY });
          e.preventDefault();
          return;
      }
      if (e.target === canvasRef.current) {
          setSelectedId(null);
          setNodeMenu(null);
      }
  };

  const startDragNode = (e: React.MouseEvent, id: string) => {
      if (e.button !== 0) return; 
      e.stopPropagation();
      e.preventDefault();
      setDraggingNodeId(id);
      setLastMousePos({ x: e.clientX, y: e.clientY });
      setSelectedId(id);
      setNodeMenu(null);
  };

  const startLink = (e: React.MouseEvent, sourceId: string, handleLabel?: string, yOffset: number = 45) => {
      e.stopPropagation();
      e.preventDefault();
      setLinkingSourceId(sourceId);
      setLinkingSourceHandle(handleLabel || null);
      setNodeMenu(null);
      const node = nodes.find(n => n.id === sourceId);
      if (node && canvasRef.current) {
          setTempEdgeEnd({ 
             x: node.position.x + NODE_WIDTH,
             y: node.position.y + yOffset
          });
      }
  };

  const completeLink = (e: React.MouseEvent, targetId: string) => {
      e.stopPropagation();
      e.preventDefault(); 
      
      // Prevent self-loop
      if (linkingSourceId && linkingSourceId !== targetId) {
          const newEdge: WorkflowEdge = {
              id: `e-${linkingSourceId}-${targetId}-${Date.now()}`,
              source: linkingSourceId,
              target: targetId,
              label: linkingSourceHandle || undefined
          };
          
          if (!edges.find(ed => ed.source === linkingSourceId && ed.target === targetId && ed.label === linkingSourceHandle)) {
              setEdges(prev => [...prev, newEdge]);
          }
      }
      setLinkingSourceId(null);
      setLinkingSourceHandle(null);
      setTempEdgeEnd(null);
  };

  const removeEdge = (id: string) => {
      setEdges(prev => prev.filter(e => e.id !== id));
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
      if (linkingSourceId && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const zoom = viewport.zoom || 1;
          const x = (e.clientX - rect.left - viewport.x) / zoom;
          const y = (e.clientY - rect.top - viewport.y) / zoom;
          
          setNodeMenu({ x, y, sourceId: linkingSourceId, handleLabel: linkingSourceHandle || undefined });
          setMenuSearch('');
      }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
      if (isPanning) {
          const dx = e.clientX - lastMousePos.x;
          const dy = e.clientY - lastMousePos.y;
          setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
          setLastMousePos({ x: e.clientX, y: e.clientY });
      } else if (draggingNodeId) {
          const zoom = viewport.zoom || 1;
          const dx = (e.clientX - lastMousePos.x) / zoom;
          const dy = (e.clientY - lastMousePos.y) / zoom;
          setNodes(prev => prev.map(n => n.id === draggingNodeId ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n));
          setLastMousePos({ x: e.clientX, y: e.clientY });
      } else if (linkingSourceId && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const zoom = viewport.zoom || 1;
          const x = (e.clientX - rect.left - viewport.x) / zoom;
          const y = (e.clientY - rect.top - viewport.y) / zoom;
          setTempEdgeEnd({ x, y });
      }
  }, [isPanning, draggingNodeId, linkingSourceId, lastMousePos, viewport]);

  const handleMouseUp = useCallback(() => {
      setIsPanning(false);
      setDraggingNodeId(null);
      setLinkingSourceId(null);
      setLinkingSourceHandle(null);
      setTempEdgeEnd(null);
  }, []);

  useEffect(() => {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [handleMouseMove, handleMouseUp]);

  const addNode = (type: NodeType, pos?: {x: number, y: number}, sourceId?: string | null, edgeLabel?: string) => {
      const id = `${type}-${Date.now()}`;
      let position = pos;
      
      if (!position) {
          const zoom = viewport.zoom || 1;
          const centerX = (-viewport.x + (canvasRef.current?.clientWidth || 800) / 2) / zoom;
          const centerY = (-viewport.y + (canvasRef.current?.clientHeight || 600) / 2) / zoom;
          position = { x: centerX - 100, y: centerY - 50 };
      }

      const newNode: WorkflowNode = {
          id,
          type,
          position: position,
          data: { 
              label: getNodeTitle(type), 
              description: t.props.desc,
              intents: type === 'classifier' ? ['General', 'Technical', 'Billing'] : undefined,
              systemPrompt: type === 'classifier' 
                ? 'You are an intelligent classifier. Analyze the user\'s input and map it to exactly one of the provided intents.' 
                : undefined,
              operator: type === 'condition' ? 'contains' : undefined
          }
      };

      setNodes(prev => [...prev, newNode]);

      if (sourceId) {
          const newEdge: WorkflowEdge = {
              id: `e-${sourceId}-${id}-${Date.now()}`,
              source: sourceId,
              target: id,
              label: edgeLabel
          };
          setEdges(prev => [...prev, newEdge]);
      }
      
      setNodeMenu(null);
  };

  const handleAiGenerate = async () => {
        if (!aiPrompt.trim()) return;
        setIsGenerating(true);
        try {
            const result = await generateWorkflow(aiPrompt, language);
            if (result && result.nodes.length > 0) {
                // Adjust positions to be relative to viewport logic if needed, or just use as is
                setNodes(result.nodes);
                setEdges(result.edges);
                setIsAiModalOpen(false);
                setAiPrompt('');
                // Reset Viewport to center start node
                setViewport({ x: 0, y: 0, zoom: 1 });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
  };

  const selectedNode = nodes.find(n => n.id === selectedId);

  const MENU_TOOLS = [
      { type: 'start', label: t.tools.start, icon: Play, desc: 'Start trigger', cat: 'Essentials' },
      { type: 'user_profile', label: t.tools.user_profile, icon: UserIcon, desc: 'Load user context', cat: 'Essentials' },
      { type: 'llm', label: t.tools.llm, icon: BrainCircuit, desc: 'Generate text/logic', cat: 'Models' },
      { type: 'classifier', label: t.tools.classifier, icon: Split, desc: 'Route by intent', cat: 'Logic' },
      { type: 'agent', label: t.tools.agent, icon: Bot, desc: 'Specialized Agent', cat: 'Models' },
      { type: 'retrieval', label: t.tools.retrieval, icon: Database, desc: 'Search RAG', cat: 'Knowledge' },
      { type: 'code', label: t.tools.code, icon: Code, desc: 'Run Python/JS', cat: 'Logic' },
      { type: 'condition', label: t.tools.condition, icon: GitBranch, desc: 'Logic Branch', cat: 'Logic' },
      { type: 'end', label: t.tools.end, icon: Terminal, desc: 'End workflow', cat: 'Essentials' },
  ];

  const filteredTools = MENU_TOOLS.filter(tool => tool.label.toLowerCase().includes(menuSearch.toLowerCase()));

  const getSourceYOffset = (node: WorkflowNode, label?: string) => {
      if (node.type === 'classifier' && node.data.intents && label) {
          const idx = node.data.intents.indexOf(label);
          if (idx !== -1) {
              return 60 + (idx * 32); 
          }
      }
      if (node.type === 'condition') {
          if (label === 'True') return 60;
          if (label === 'False') return 92;
      }
      return 45; // Default for standard nodes
  };

  return (
    <div className="flex flex-col h-full bg-background text-textMain font-sans">
      
      {/* AI Prompt Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl p-6 relative">
                <button onClick={() => setIsAiModalOpen(false)} className="absolute top-4 right-4 text-textSecondary hover:text-textMain"><X size={20}/></button>
                <h3 className="text-lg font-bold text-textMain mb-2 flex items-center gap-2">
                    <Sparkles size={18} className="text-accent"/> 
                    {language === 'zh' ? 'AI 自动生成工作流' : 'AI Workflow Generator'}
                </h3>
                <p className="text-xs text-textSecondary mb-4">
                    {language === 'zh' 
                        ? '简要描述您想要的流程，AI 将自动创建节点和连线。' 
                        : 'Describe your workflow, and AI will automatically build the nodes and connections.'}
                </p>
                <textarea 
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder={language === 'zh' ? '例如：如果用户问的是技术问题，转给代码专家，否则转给客服...' : "e.g. If user asks about pricing, send to Sales Agent, otherwise answer with LLM..."}
                    className="w-full h-32 bg-background border border-border rounded-xl p-4 text-sm text-textMain focus:border-accent outline-none resize-none mb-4 font-medium"
                />
                <div className="flex justify-end gap-3">
                    <button onClick={() => setIsAiModalOpen(false)} className="px-4 py-2 text-textSecondary hover:bg-background rounded-lg text-sm font-bold">{t.props.deleteNode ? 'Cancel' : 'Cancel'}</button>
                    <button 
                        onClick={handleAiGenerate} 
                        disabled={isGenerating || !aiPrompt.trim()}
                        className="px-6 py-2 bg-accent hover:brightness-110 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-accent/20"
                    >
                        {isGenerating ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}
                        {language === 'zh' ? '立即生成' : 'Generate'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Top Header */}
      <div className="h-14 border-b border-border bg-surface flex items-center justify-between px-4 z-30 shadow-sm">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 hover:bg-background rounded-lg text-textSecondary hover:text-textMain transition-colors">
                  <ArrowLeft size={18} />
              </button>
              <div>
                  <h2 className="font-bold text-textMain leading-tight">{t.title}</h2>
                  <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                      <span className="text-[10px] text-textSecondary uppercase tracking-wide">{t.draft}</span>
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-3">
              <div className="text-xs text-textSecondary hidden md:block mr-2">
                 Double-click edge to delete • Alt+Drag to pan
              </div>
              
              {/* Test Run Button */}
              <button 
                onClick={() => setIsTestMode(!isTestMode)}
                className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${isTestMode ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-surface border-border text-textMain hover:border-emerald-500 hover:text-emerald-500'}`}
              >
                  <PlayCircle size={14} /> {t.testRun || 'Test Run'}
              </button>

              {/* AI Button */}
              <button 
                onClick={() => setIsAiModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/20 text-accent rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-accent hover:text-white transition-all active:scale-95"
              >
                  <Sparkles size={14} /> {language === 'zh' ? 'AI 生成' : 'AI Gen'}
              </button>

              <button 
                onClick={() => onDeploy(nodes)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:brightness-110 shadow-lg shadow-primary/20 transition-all active:scale-95"
              >
                  <Rocket size={14} /> {t.publish}
              </button>
          </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
          
          {/* Left Toolbar (Component Palette) */}
          <div className="w-16 md:w-64 bg-surface border-r border-border flex flex-col z-20 shadow-xl">
              <div className="p-4 border-b border-border hidden md:block">
                  <h3 className="text-xs font-bold text-textSecondary uppercase tracking-wider flex items-center gap-2">
                      <Layers size={14} /> {t.components}
                  </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-6">
                  {Object.values(t.categories).map((catName: string) => {
                       // Simple fallback mapping if exact strings don't match due to translation keys
                       const displayTools = MENU_TOOLS.filter(tool => {
                           if (catName === t.categories.essentials) return tool.cat === 'Essentials';
                           if (catName === t.categories.models) return tool.cat === 'Models';
                           if (catName === t.categories.knowledge) return tool.cat === 'Knowledge';
                           return tool.cat === 'Logic';
                       });

                       return (
                           <div key={catName}>
                               <div className="text-[10px] font-bold text-textSecondary uppercase mb-2 px-2 hidden md:block opacity-60">{catName}</div>
                               <div className="space-y-1">
                                   {displayTools.map(tool => (
                                       <button 
                                            key={tool.type}
                                            onClick={() => addNode(tool.type as NodeType)}
                                            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-textSecondary hover:bg-background hover:text-textMain hover:shadow-sm transition-all group border border-transparent hover:border-border"
                                            title={tool.label}
                                        >
                                            <div className={`w-8 h-8 rounded-md flex items-center justify-center bg-background border border-border group-hover:border-primary/50 group-hover:text-primary transition-colors shadow-sm`}>
                                                <tool.icon size={16} />
                                            </div>
                                            <div className="text-left hidden md:block">
                                                <div className="text-xs font-bold">{tool.label}</div>
                                                <div className="text-[9px] opacity-70 font-medium">{tool.desc}</div>
                                            </div>
                                        </button>
                                   ))}
                               </div>
                           </div>
                       )
                  })}
              </div>
          </div>

          {/* Main Canvas */}
          <div 
            className="flex-1 relative overflow-hidden bg-[#0f1115] cursor-crosshair" 
            ref={canvasRef} 
            onMouseDown={handleMouseDown}
            onMouseUp={handleCanvasMouseUp}
          >
              {/* Grid */}
              <div 
                className="absolute inset-0 pointer-events-none opacity-[0.15]"
                style={{
                    backgroundImage: `radial-gradient(var(--color-border) 1px, transparent 1px)`,
                    backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
                    backgroundPosition: `${viewport.x}px ${viewport.y}px`
                }}
              />

              <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
                  
                  {/* SVG Layer for Edges */}
                  <svg className="absolute top-0 left-0 w-[50000px] h-[50000px] pointer-events-none overflow-visible">
                      <defs>
                          <marker id="arrow-default" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                              <path d="M2,2 L10,6 L2,10 L2,2 Z" fill="#64748b" />
                          </marker>
                          <marker id="arrow-success" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                              <path d="M2,2 L10,6 L2,10 L2,2 Z" fill="#10b981" />
                          </marker>
                          <marker id="arrow-danger" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                              <path d="M2,2 L10,6 L2,10 L2,2 Z" fill="#ef4444" />
                          </marker>
                          <marker id="arrow-active" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                              <path d="M2,2 L10,6 L2,10 L2,2 Z" fill="var(--color-primary)" />
                          </marker>
                      </defs>

                      {edges.map(edge => {
                          const src = nodes.find(n => n.id === edge.source);
                          const tgt = nodes.find(n => n.id === edge.target);
                          if(!src || !tgt) return null;
                          
                          const yOffset = getSourceYOffset(src, edge.label);
                          const sx = src.position.x + NODE_WIDTH;
                          const sy = src.position.y + yOffset;
                          const tx = tgt.position.x;
                          const ty = tgt.position.y + 45;
                          
                          const midX = (sx + tx) / 2;
                          const midY = (sy + ty) / 2;

                          const color = edge.label === 'False' ? '#ef4444' : (edge.label === 'True' ? '#10b981' : '#64748b');
                          const markerId = edge.label === 'False' ? 'url(#arrow-danger)' : (edge.label === 'True' ? 'url(#arrow-success)' : 'url(#arrow-default)');
                          const isHovered = hoveredEdgeId === edge.id;
                          const isActive = activeEdgeId === edge.id; // Highlighting for Execution

                          return (
                              <g 
                                key={edge.id} 
                                onMouseEnter={() => setHoveredEdgeId(edge.id)}
                                onMouseLeave={() => setHoveredEdgeId(null)}
                                onDoubleClick={(e) => { e.stopPropagation(); removeEdge(edge.id); }}
                                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                              >
                                {/* Invisible Thick Path for easier clicking */}
                                <path 
                                    d={getEdgePath(sx, sy, tx, ty)}
                                    stroke="transparent"
                                    strokeWidth="15"
                                    fill="none"
                                />
                                {/* Visible Path */}
                                <path 
                                    d={getEdgePath(sx, sy, tx, ty)}
                                    stroke={isActive ? 'var(--color-primary)' : (isHovered ? 'var(--color-primary)' : color)}
                                    strokeWidth={isActive || isHovered ? "3" : "2"}
                                    fill="none"
                                    strokeDasharray={isActive ? "5,5" : "none"}
                                    markerEnd={isActive || isHovered ? 'url(#arrow-active)' : markerId}
                                    className={`transition-all duration-300 ${isActive ? 'animate-pulse' : ''}`}
                                />
                                {edge.label && (
                                    <foreignObject x={midX - 40} y={midY - 12} width="80" height="24">
                                        <div className={`text-[10px] border rounded px-2 py-0.5 text-center truncate shadow-sm font-bold backdrop-blur-md
                                            ${edge.label === 'True' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500' : 
                                              edge.label === 'False' ? 'bg-red-500/10 border-red-500/50 text-red-500' : 
                                              'bg-surface/80 border-border text-textSecondary'}`}>
                                            {edge.label}
                                        </div>
                                    </foreignObject>
                                )}
                              </g>
                          );
                      })}
                      
                      {linkingSourceId && tempEdgeEnd && (
                          <path 
                            d={getEdgePath(nodes.find(n => n.id === linkingSourceId)!.position.x + NODE_WIDTH, nodes.find(n => n.id === linkingSourceId)!.position.y + (linkingSourceId ? getSourceYOffset(nodes.find(n => n.id === linkingSourceId)!, linkingSourceHandle || undefined) : 45), tempEdgeEnd.x, tempEdgeEnd.y)}
                            stroke="var(--color-primary)"
                            strokeWidth="2"
                            fill="none"
                            strokeDasharray="5,5"
                            markerEnd="url(#arrow-active)"
                            className="animate-pulse opacity-80"
                          />
                      )}
                  </svg>

                  {/* Nodes */}
                  {nodes.map(node => {
                      const isSelected = selectedId === node.id;
                      const isActive = activeNodeId === node.id; // Execution Highlighting
                      const style = getNodeStyles(node.type);
                      
                      let resolvedAgentName = '';
                      let resolvedAgentAvatar = '';
                      if (node.type === 'agent' && node.data.agentId) {
                          const agent = agents.find(a => a.id === node.data.agentId);
                          if (agent) {
                              resolvedAgentName = agent.name;
                              resolvedAgentAvatar = agent.avatar;
                          }
                      }

                      return (
                          <div 
                            key={node.id}
                            onMouseDown={(e) => startDragNode(e, node.id)}
                            className={`absolute select-none bg-surface/90 backdrop-blur-xl rounded-xl border flex flex-col transition-all duration-300 group
                                ${isActive ? `ring-4 ring-emerald-500/50 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)] scale-[1.05] z-50` : 
                                  isSelected ? `ring-2 ring-primary border-transparent shadow-2xl scale-[1.02] z-10` : 
                                  `border-border hover:border-primary/50 hover:shadow-lg z-0`}`}
                            style={{ 
                                left: node.position.x, 
                                top: node.position.y,
                                width: NODE_WIDTH,
                                minHeight: node.type === 'classifier' ? 100 + ((node.data.intents?.length || 0) * 32) : (node.type === 'condition' ? 140 : 'auto')
                            }}
                          >
                              {/* Header */}
                              <div className={`h-10 px-3 rounded-t-xl flex items-center justify-between border-b border-border/50 relative overflow-hidden`}>
                                  <div className={`absolute inset-0 opacity-10 ${style.bg}`}></div>
                                  <div className="flex items-center gap-2 relative z-10">
                                      <div className={`p-1 rounded-md shadow-sm ${style.iconBg}`}>
                                          {getNodeIcon(node.type)}
                                      </div>
                                      <span className="text-xs font-bold text-textMain uppercase tracking-wide opacity-90">{node.type}</span>
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); setNodes(nodes.filter(n=>n.id !== node.id)); setEdges(edges.filter(ed => ed.source !== node.id && ed.target !== node.id)) }} className="text-textSecondary hover:text-red-500 relative z-10 p-1 hover:bg-white/10 rounded">
                                      <X size={14} />
                                  </button>
                              </div>

                              {/* Body */}
                              <div className="p-4 rounded-b-xl relative">
                                  <div className="font-bold text-sm text-textMain mb-1 pr-4">{node.data.label}</div>
                                  <div className="text-[10px] text-textSecondary line-clamp-2 leading-relaxed">{node.data.description}</div>
                                  
                                  {node.type === 'llm' && (
                                      <div className="mt-3 text-[10px] bg-background border border-border rounded px-2 py-1.5 font-mono text-primary truncate flex items-center gap-1">
                                          <BrainCircuit size={10}/> {node.data.model || 'gemini-pro'}
                                      </div>
                                  )}

                                  {node.type === 'user_profile' && (
                                      <div className="mt-3 p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                                          <div className="text-[10px] font-mono text-indigo-400">
                                              Outputs user context
                                          </div>
                                      </div>
                                  )}

                                  {node.type === 'agent' && resolvedAgentName && (
                                      <div className="mt-3 flex items-center gap-2 p-2 bg-background/50 rounded-lg border border-border">
                                          <img src={resolvedAgentAvatar} alt="" className="w-6 h-6 rounded bg-black/20" />
                                          <span className="text-xs font-medium text-textMain truncate">{resolvedAgentName}</span>
                                      </div>
                                  )}

                                  {node.type === 'condition' && (
                                       <div className="mt-3 space-y-2">
                                            <div className="text-[10px] bg-background/50 p-2 rounded border border-border font-mono text-textSecondary truncate">
                                                if <span className="text-cyan-400">{node.data.variable || 'var'}</span> {node.data.operator || '=='} <span className="text-cyan-400">{node.data.value || '?'}</span>
                                            </div>
                                            <div className="flex flex-col gap-2 relative mt-1">
                                                <div className="flex items-center justify-end h-6">
                                                    <span className="text-[10px] font-bold text-emerald-500 mr-2 uppercase">True</span>
                                                    <div 
                                                        onMouseDown={(e) => startLink(e, node.id, 'True', 60)}
                                                        className="absolute -right-[21px] top-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface bg-emerald-500 hover:scale-125 z-50 cursor-crosshair shadow-sm transition-transform"
                                                    />
                                                </div>
                                                <div className="flex items-center justify-end h-6">
                                                    <span className="text-[10px] font-bold text-red-500 mr-2 uppercase">False</span>
                                                     <div 
                                                        onMouseDown={(e) => startLink(e, node.id, 'False', 92)}
                                                        className="absolute -right-[21px] top-8 w-3.5 h-3.5 rounded-full border-2 border-surface bg-red-500 hover:scale-125 z-50 cursor-crosshair shadow-sm transition-transform"
                                                    />
                                                </div>
                                            </div>
                                       </div>
                                  )}

                                  {node.type === 'classifier' && (
                                      <div className="mt-3">
                                          <div className="space-y-3">
                                              {node.data.intents?.map((intent, idx) => (
                                                  <div key={idx} className="flex items-center justify-end h-5 relative">
                                                      <span className="text-[10px] font-medium text-textSecondary mr-3 bg-background px-1.5 py-0.5 rounded border border-border">{intent}</span>
                                                      <div 
                                                        onMouseDown={(e) => startLink(e, node.id, intent, 60 + (idx * 32))}
                                                        className="absolute -right-[21px] w-3.5 h-3.5 rounded-full border-2 border-surface bg-orange-400 hover:scale-125 z-50 cursor-crosshair transition-transform shadow-sm"
                                                        title={`Link ${intent}`}
                                                      />
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                  )}
                              </div>

                              {/* Standard Output Handle */}
                              {node.type !== 'end' && node.type !== 'classifier' && node.type !== 'condition' && (
                                  <div 
                                    onMouseDown={(e) => startLink(e, node.id)}
                                    className="absolute right-[-7px] top-[40px] w-3.5 h-3.5 rounded-full border-2 border-surface bg-textSecondary hover:bg-primary hover:scale-125 z-50 cursor-crosshair transition-all shadow-sm" 
                                  />
                              )}

                              {/* Input Handle */}
                              {node.type !== 'start' && (
                                  <div 
                                    onMouseUp={(e) => completeLink(e, node.id)}
                                    className="absolute left-[-7px] top-[40px] w-3.5 h-3.5 rounded-full border-2 border-surface bg-textSecondary hover:bg-primary hover:scale-125 z-50 cursor-pointer transition-all shadow-sm"
                                  />
                              )}
                          </div>
                      );
                  })}
              </div>

              {/* Node Creation Menu */}
              {nodeMenu && (
                  <div 
                    className="absolute z-50 w-64 bg-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in origin-top-left ring-1 ring-white/10"
                    style={{ 
                        left: nodeMenu.x * viewport.zoom + viewport.x, 
                        top: nodeMenu.y * viewport.zoom + viewport.y 
                    }}
                    onMouseDown={e => e.stopPropagation()}
                  >
                      <div className="p-2 border-b border-border bg-background/50">
                          <div className="relative">
                              <Search className="absolute left-2 top-1.5 text-textSecondary" size={14} />
                              <input 
                                autoFocus
                                type="text" 
                                placeholder="Search nodes..." 
                                className="w-full bg-background border border-border rounded-lg pl-8 pr-2 py-1.5 text-xs text-textMain focus:border-primary outline-none"
                                value={menuSearch}
                                onChange={e => setMenuSearch(e.target.value)}
                              />
                          </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto p-1 bg-surface">
                          {filteredTools.map(tool => (
                              <button 
                                key={tool.type}
                                onClick={() => addNode(tool.type as NodeType, { x: nodeMenu.x, y: nodeMenu.y }, nodeMenu.sourceId, nodeMenu.handleLabel)}
                                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-background hover:text-textMain text-textSecondary transition-colors text-left group"
                              >
                                  <div className={`p-1.5 rounded-md bg-background border border-border group-hover:border-primary/50 group-hover:text-primary`}>
                                      <tool.icon size={14} />
                                  </div>
                                  <div>
                                      <div className="text-xs font-bold">{tool.label}</div>
                                      <div className="text-[10px] opacity-70">{tool.desc}</div>
                                  </div>
                              </button>
                          ))}
                      </div>
                  </div>
              )}
          </div>

          {/* Right Panel (Inspector) OR Test Console */}
          {isTestMode ? (
              <div className="w-80 bg-surface border-l border-border flex flex-col z-30 shadow-2xl animate-slide-up">
                  <div className="p-4 border-b border-border flex justify-between items-center bg-background/30">
                      <h3 className="font-bold text-textMain flex items-center gap-2">
                          <Terminal size={16} className="text-emerald-500" />
                          {t.testConsole || 'Test Console'}
                      </h3>
                      <button onClick={() => setIsTestMode(false)} className="p-1 text-textSecondary hover:text-textMain hover:bg-background rounded">
                          <X size={16}/>
                      </button>
                  </div>
                  
                  {/* Log Output */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs" ref={logContainerRef}>
                      {executionLog.length === 0 && (
                          <div className="text-textSecondary opacity-50 text-center italic mt-10">
                              Ready to run. Type a message below.
                          </div>
                      )}
                      {executionLog.map((log) => (
                          <div key={log.id} className={`p-2 rounded border break-words animate-fade-in
                              ${log.type === 'user' ? 'bg-primary/10 border-primary/20 text-textMain' : 
                                log.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                log.type === 'output' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
                                'bg-surface border-border text-textSecondary'}`}>
                              {log.nodeId && <div className="text-[9px] uppercase font-bold opacity-50 mb-1">{nodes.find(n=>n.id===log.nodeId)?.type || 'System'}</div>}
                              {log.content}
                          </div>
                      ))}
                      {isExecuting && (
                          <div className="flex items-center gap-2 text-textSecondary p-2">
                              <Loader2 size={12} className="animate-spin" /> {t.running || 'Running...'}
                          </div>
                      )}
                  </div>

                  {/* Input */}
                  <div className="p-3 border-t border-border bg-background/50">
                      <div className="flex gap-2">
                          <input 
                              type="text" 
                              value={testInput}
                              onChange={e => setTestInput(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && runWorkflow()}
                              placeholder={t.inputPlaceholder || 'Test input...'}
                              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-textMain focus:border-emerald-500 outline-none"
                              disabled={isExecuting}
                          />
                          <button 
                              onClick={runWorkflow}
                              disabled={isExecuting || !testInput.trim()}
                              className="p-2 bg-emerald-500 hover:brightness-110 text-white rounded-lg disabled:opacity-50 transition-colors"
                          >
                              <Send size={14} />
                          </button>
                      </div>
                  </div>
              </div>
          ) : (
              selectedNode && (
                  <div className="w-80 bg-surface border-l border-border flex flex-col z-20 shadow-2xl">
                      {/* ... (Existing Inspector Code) ... */}
                      <div className="p-5 border-b border-border bg-background/30">
                          <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${getNodeStyles(selectedNode.type).iconBg} shadow-lg`}>
                                  {getNodeIcon(selectedNode.type)}
                              </div>
                              <div>
                                  <div className="text-[10px] font-bold text-textSecondary uppercase tracking-wider">{selectedNode.type} Node</div>
                                  <h2 className="font-bold text-textMain text-sm">{selectedNode.data.label}</h2>
                              </div>
                          </div>
                      </div>
                      
                      <div className="p-6 flex-1 overflow-y-auto space-y-6">
                          
                          {/* Common Fields */}
                          <div className="space-y-4">
                              <div>
                                  <label className="text-xs font-bold text-textSecondary uppercase block mb-1.5 flex items-center gap-2">
                                      <MousePointer2 size={12}/> {t.props.label}
                                  </label>
                                  <input 
                                    type="text" 
                                    value={selectedNode.data.label} 
                                    onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, label: e.target.value } } : n))}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none transition-colors"
                                  />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-textSecondary uppercase block mb-1.5">{t.props.desc}</label>
                                  <textarea 
                                    value={selectedNode.data.description || ''} 
                                    onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, description: e.target.value } } : n))}
                                    className="w-full h-20 bg-background border border-border rounded-lg px-3 py-2 text-xs text-textMain focus:border-primary outline-none resize-none transition-colors"
                                  />
                              </div>
                          </div>

                          <div className="h-px bg-border w-full" />

                          {/* --- START NODE --- */}
                          {selectedNode.type === 'start' && (
                              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 leading-relaxed">
                                  <Play size={14} className="inline mr-1 mb-0.5"/>
                                  Start node triggers when user sends a message. Access input via <code>{`{{input}}`}</code>.
                              </div>
                          )}

                          {/* --- END NODE --- */}
                          {selectedNode.type === 'end' && (
                              <div className="p-3 bg-slate-500/10 border border-slate-500/20 rounded-lg text-xs text-slate-300 leading-relaxed">
                                   Final output passed here will be the response to the user.
                              </div>
                          )}

                           {/* --- USER PROFILE NODE --- */}
                           {selectedNode.type === 'user_profile' && (
                              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs text-indigo-300 leading-relaxed">
                                  <UserIcon size={14} className="inline mr-1 mb-0.5"/>
                                  Loads user onboarding data (e.g. Industry, Role). Use in other nodes via <code>{`{{user_profile}}`}</code> variable.
                              </div>
                          )}

                          {/* --- AGENT NODE --- */}
                          {selectedNode.type === 'agent' && (
                              <div className="space-y-4">
                                 <div>
                                    <label className="text-xs font-bold text-textSecondary uppercase block mb-2">Select Agent</label>
                                    <select 
                                        value={selectedNode.data.agentId || ''}
                                        onChange={(e) => {
                                            const agent = agents.find(a => a.id === e.target.value);
                                            setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, agentId: e.target.value, label: agent ? agent.name : n.data.label } } : n));
                                        }}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                    >
                                        <option value="" disabled>-- Choose an Agent --</option>
                                        {agents.filter(a => a.id !== 'a1').map(agent => (
                                            <option key={agent.id} value={agent.id}>
                                                {agent.name} ({agent.category})
                                            </option>
                                        ))}
                                    </select>
                                 </div>
                                 <div>
                                    <label className="text-xs font-bold text-textSecondary uppercase block mb-2">Cost Override</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            value={selectedNode.data.costOverride || ''}
                                            placeholder="Default"
                                            onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, costOverride: parseFloat(e.target.value) } } : n))}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                        />
                                        <span className="absolute right-3 top-2 text-xs text-textSecondary">credits</span>
                                    </div>
                                 </div>
                              </div>
                          )}

                          {/* --- CONDITION NODE --- */}
                          {selectedNode.type === 'condition' && (
                              <div className="space-y-4">
                                 <div>
                                    <label className="text-xs font-bold text-textSecondary uppercase block mb-2">Variable</label>
                                    <input 
                                        type="text" 
                                        value={selectedNode.data.variable || ''}
                                        placeholder="e.g. input"
                                        onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, variable: e.target.value } } : n))}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-cyan-400 font-mono focus:border-cyan-500 outline-none"
                                    />
                                 </div>
                                 <div>
                                    <label className="text-xs font-bold text-textSecondary uppercase block mb-2">Operator</label>
                                    <select 
                                        value={selectedNode.data.operator || 'contains'}
                                        onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, operator: e.target.value as any } } : n))}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-cyan-500 outline-none"
                                    >
                                        <option value="contains">Contains</option>
                                        <option value="equals">Equals</option>
                                        <option value="empty">Is Empty</option>
                                    </select>
                                 </div>
                                 {selectedNode.data.operator !== 'empty' && (
                                     <div>
                                        <label className="text-xs font-bold text-textSecondary uppercase block mb-2">Value</label>
                                        <input 
                                            type="text" 
                                            value={selectedNode.data.value || ''}
                                            placeholder="Value to check"
                                            onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, value: e.target.value } } : n))}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-cyan-500 outline-none"
                                        />
                                     </div>
                                 )}
                              </div>
                          )}

                          {/* --- CLASSIFIER NODE --- */}
                          {selectedNode.type === 'classifier' && (
                              <div className="space-y-4">
                                  <div>
                                      <label className="text-xs font-bold text-textSecondary uppercase block mb-2">{t.props.model}</label>
                                      <select 
                                          value={selectedNode.data.model || 'gemini-3-flash-preview'}
                                          onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, model: e.target.value } } : n))}
                                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                      >
                                          <option value="gemini-3-flash-preview">Gemini 3 Flash (Fast)</option>
                                          <option value="gemini-3-pro-preview">Gemini 3 Pro (Smart)</option>
                                      </select>
                                  </div>

                                  <div>
                                      <label className="text-xs font-bold text-textSecondary uppercase block mb-2">{t.props.systemPrompt}</label>
                                      <textarea 
                                          value={selectedNode.data.systemPrompt || ''}
                                          onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, systemPrompt: e.target.value } } : n))}
                                          className="w-full h-24 bg-background border border-border rounded-lg px-3 py-2 text-xs text-textMain font-mono focus:border-primary outline-none resize-none"
                                          placeholder="Instruction on how to classify..."
                                      />
                                  </div>

                                  <div>
                                      <div className="flex items-center justify-between mb-2">
                                          <label className="text-xs font-bold text-textSecondary uppercase">{t.props.intents}</label>
                                          <button 
                                            onClick={() => {
                                                const newIntents = [...(selectedNode.data.intents || []), 'New Intent'];
                                                setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, intents: newIntents } } : n));
                                            }}
                                            className="p-1 rounded bg-background border border-border hover:border-primary text-primary"
                                          >
                                              <Plus size={12} />
                                          </button>
                                      </div>
                                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                          {selectedNode.data.intents?.map((intent, idx) => (
                                              <div key={idx} className="flex gap-2">
                                                  <input 
                                                    type="text" 
                                                    value={intent}
                                                    onChange={(e) => {
                                                        const newIntents = [...(selectedNode.data.intents || [])];
                                                        newIntents[idx] = e.target.value;
                                                        setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, intents: newIntents } } : n));
                                                    }}
                                                    className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs text-textMain focus:border-primary outline-none"
                                                  />
                                                  <button 
                                                    onClick={() => {
                                                        const newIntents = selectedNode.data.intents?.filter((_, i) => i !== idx);
                                                        setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, intents: newIntents } } : n));
                                                    }}
                                                    className="p-1.5 text-textSecondary hover:text-red-500 hover:bg-background rounded"
                                                  >
                                                      <Trash2 size={12} />
                                                  </button>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              </div>
                          )}

                          {/* --- LLM NODE --- */}
                          {selectedNode.type === 'llm' && (
                              <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-textSecondary uppercase block mb-2">{t.props.model}</label>
                                    <select 
                                        value={selectedNode.data.model || 'gemini-3-flash-preview'}
                                        onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, model: e.target.value } } : n))}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                    >
                                        <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                                        <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-textSecondary uppercase block mb-2">{t.props.systemPrompt}</label>
                                    <textarea 
                                        value={selectedNode.data.systemPrompt || ''}
                                        onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, systemPrompt: e.target.value } } : n))}
                                        className="w-full h-32 bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain font-mono focus:border-primary outline-none resize-none"
                                        placeholder="You are a helpful assistant..."
                                    />
                                    <div className="mt-2 flex gap-2 flex-wrap">
                                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20 border border-primary/20">{`{{input}}`}</span>
                                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20 border border-primary/20">{`{{context}}`}</span>
                                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20 border border-primary/20">{`{{user_profile}}`}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-xs font-bold text-textSecondary uppercase">{t.props.temperature}</label>
                                        <span className="text-xs font-mono text-primary">{selectedNode.data.temperature || 0.7}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.1"
                                        value={selectedNode.data.temperature || 0.7}
                                        onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, temperature: parseFloat(e.target.value) } } : n))}
                                        className="w-full h-1.5 bg-background rounded-lg appearance-none cursor-pointer accent-primary"
                                    />
                                </div>
                              </div>
                          )}

                          <div className="pt-6 mt-auto">
                              <button 
                                onClick={() => {
                                    setNodes(nodes.filter(n => n.id !== selectedId));
                                    setEdges(edges.filter(e => e.source !== selectedId && e.target !== selectedId));
                                    setSelectedId(null);
                                }}
                                className="w-full py-2.5 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all flex items-center justify-center gap-2 text-sm font-medium"
                              >
                                  <Trash2 size={16} />
                                  {t.props.deleteNode}
                              </button>
                          </div>
                      </div>
                  </div>
              )
          )}
      </div>
    </div>
  );
};

export default OrchestrationStudio;
