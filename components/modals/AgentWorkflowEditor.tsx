import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Agent, Language } from '../../types';
import { translations } from '../../utils/translations';
import { 
    X, Play, MessageSquare, BrainCircuit, Database, GitBranch, 
    Terminal, Plus, Trash2, Settings, Save, ChevronRight, 
    FileText, Zap, Search, MousePointer2, Sparkles, Variable,
    ArrowRight, GripVertical, Code, Bot, Send
} from 'lucide-react';

// 节点类型定义
type AgentNodeType = 'start' | 'prompt' | 'knowledge' | 'condition' | 'reply' | 'variable' | 'tool' | 'llm';

interface AgentNode {
    id: string;
    type: AgentNodeType;
    position: { x: number; y: number };
    data: {
        label: string;
        description?: string;
        // 不同节点类型的特定数据
        systemPrompt?: string;
        knowledgeFiles?: string[];
        condition?: { variable: string; operator: string; value: string };
        replyContent?: string;
        variableName?: string;
        variableValue?: string;
        toolName?: string;
        toolConfig?: any;
    };
}

interface AgentEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
}

interface AgentWorkflowEditorProps {
    agent: Agent;
    onClose: () => void;
    onSave: (agent: Agent, workflow: { nodes: AgentNode[]; edges: AgentEdge[] }) => void;
    language: Language;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;

// 贝塞尔曲线路径
const getEdgePath = (sourceX: number, sourceY: number, targetX: number, targetY: number) => {
    if (Number.isNaN(sourceX) || Number.isNaN(sourceY) || Number.isNaN(targetX) || Number.isNaN(targetY)) return '';
    const deltaX = Math.abs(targetX - sourceX);
    const controlPointX = Math.max(deltaX * 0.5, 60);
    return `M${sourceX},${sourceY} C${sourceX + controlPointX},${sourceY} ${targetX - controlPointX},${targetY} ${targetX},${targetY}`;
};

const AgentWorkflowEditor: React.FC<AgentWorkflowEditorProps> = ({ agent, onClose, onSave, language }) => {
    const t = translations[language]?.common || translations['en'].common;
    const canvasRef = useRef<HTMLDivElement>(null);

    // 初始化节点
    const [nodes, setNodes] = useState<AgentNode[]>([
        { id: 'start', type: 'start', position: { x: 100, y: 200 }, data: { label: '开始', description: '用户发送消息时触发' } },
        { id: 'prompt-1', type: 'prompt', position: { x: 400, y: 200 }, data: { label: '系统提示词', systemPrompt: agent.systemPrompt || '' } },
        { id: 'reply-1', type: 'reply', position: { x: 700, y: 200 }, data: { label: '回复用户', replyContent: '{{llm_output}}' } },
    ]);
    
    const [edges, setEdges] = useState<AgentEdge[]>([
        { id: 'e-start-prompt', source: 'start', target: 'prompt-1' },
        { id: 'e-prompt-reply', source: 'prompt-1', target: 'reply-1' },
    ]);

    // UI 状态
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    
    // 连线状态
    const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);
    const [tempEdgeEnd, setTempEdgeEnd] = useState<{ x: number; y: number } | null>(null);
    
    // 节点菜单
    const [showNodeMenu, setShowNodeMenu] = useState(false);
    const [nodeMenuPosition, setNodeMenuPosition] = useState({ x: 0, y: 0 });
    const [menuSearch, setMenuSearch] = useState('');

    // 属性面板
    const [showPropertyPanel, setShowPropertyPanel] = useState(false);

    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    // 节点样式
    const getNodeStyles = (type: AgentNodeType) => {
        switch(type) {
            case 'start': return { border: 'border-emerald-500', bg: 'bg-emerald-500/10', iconBg: 'bg-emerald-500', color: 'text-emerald-500' };
            case 'prompt': return { border: 'border-violet-500', bg: 'bg-violet-500/10', iconBg: 'bg-violet-500', color: 'text-violet-500' };
            case 'knowledge': return { border: 'border-amber-500', bg: 'bg-amber-500/10', iconBg: 'bg-amber-500', color: 'text-amber-500' };
            case 'condition': return { border: 'border-cyan-500', bg: 'bg-cyan-500/10', iconBg: 'bg-cyan-500', color: 'text-cyan-500' };
            case 'reply': return { border: 'border-blue-500', bg: 'bg-blue-500/10', iconBg: 'bg-blue-500', color: 'text-blue-500' };
            case 'variable': return { border: 'border-pink-500', bg: 'bg-pink-500/10', iconBg: 'bg-pink-500', color: 'text-pink-500' };
            case 'tool': return { border: 'border-orange-500', bg: 'bg-orange-500/10', iconBg: 'bg-orange-500', color: 'text-orange-500' };
            case 'llm': return { border: 'border-purple-500', bg: 'bg-purple-500/10', iconBg: 'bg-purple-500', color: 'text-purple-500' };
            default: return { border: 'border-gray-500', bg: 'bg-gray-500/10', iconBg: 'bg-gray-500', color: 'text-gray-500' };
        }
    };

    // 节点图标
    const getNodeIcon = (type: AgentNodeType) => {
        switch(type) {
            case 'start': return <Play size={16} className="text-white fill-white" />;
            case 'prompt': return <MessageSquare size={16} className="text-white" />;
            case 'knowledge': return <Database size={16} className="text-white" />;
            case 'condition': return <GitBranch size={16} className="text-white" />;
            case 'reply': return <Send size={16} className="text-white" />;
            case 'variable': return <Variable size={16} className="text-white" />;
            case 'tool': return <Code size={16} className="text-white" />;
            case 'llm': return <BrainCircuit size={16} className="text-white" />;
            default: return <Zap size={16} className="text-white" />;
        }
    };

    // 可用节点类型
    const nodeTypes: { type: AgentNodeType; label: string; labelZh: string; description: string }[] = [
        { type: 'prompt', label: 'System Prompt', labelZh: '系统提示词', description: '设置 AI 的角色和行为' },
        { type: 'llm', label: 'LLM Call', labelZh: 'AI 模型调用', description: '调用大语言模型生成回复' },
        { type: 'knowledge', label: 'Knowledge Base', labelZh: '知识库检索', description: '从知识库中检索相关内容' },
        { type: 'condition', label: 'Condition', labelZh: '条件分支', description: '根据条件选择不同路径' },
        { type: 'variable', label: 'Variable', labelZh: '变量设置', description: '设置或修改变量值' },
        { type: 'tool', label: 'Tool Call', labelZh: '工具调用', description: '调用外部工具或 API' },
        { type: 'reply', label: 'Reply', labelZh: '回复用户', description: '向用户发送回复消息' },
    ];

    // 添加节点
    const addNode = (type: AgentNodeType) => {
        const nodeType = nodeTypes.find(n => n.type === type);
        const newNode: AgentNode = {
            id: `${type}-${Date.now()}`,
            type,
            position: { x: nodeMenuPosition.x, y: nodeMenuPosition.y },
            data: {
                label: language === 'zh' ? (nodeType?.labelZh || type) : (nodeType?.label || type),
                description: nodeType?.description,
            }
        };
        
        // 如果有连线源，创建边
        if (linkingSourceId) {
            const newEdge: AgentEdge = {
                id: `e-${linkingSourceId}-${newNode.id}`,
                source: linkingSourceId,
                target: newNode.id
            };
            setEdges(prev => [...prev, newEdge]);
        }
        
        setNodes(prev => [...prev, newNode]);
        setShowNodeMenu(false);
        setLinkingSourceId(null);
        setTempEdgeEnd(null);
        setSelectedNodeId(newNode.id);
        setShowPropertyPanel(true);
    };

    // 删除节点
    const deleteNode = (id: string) => {
        if (id === 'start') return; // 不能删除开始节点
        setNodes(prev => prev.filter(n => n.id !== id));
        setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
        if (selectedNodeId === id) {
            setSelectedNodeId(null);
            setShowPropertyPanel(false);
        }
    };

    // 删除边
    const deleteEdge = (id: string) => {
        setEdges(prev => prev.filter(e => e.id !== id));
    };

    // 更新节点数据
    const updateNodeData = (id: string, data: Partial<AgentNode['data']>) => {
        setNodes(prev => prev.map(n => 
            n.id === id ? { ...n, data: { ...n.data, ...data } } : n
        ));
    };

    // 鼠标事件处理
    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            setIsPanning(true);
            setLastMousePos({ x: e.clientX, y: e.clientY });
            e.preventDefault();
            return;
        }
        if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-bg')) {
            setSelectedNodeId(null);
            setShowNodeMenu(false);
            setShowPropertyPanel(false);
        }
    };

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        setDraggingNodeId(id);
        setLastMousePos({ x: e.clientX, y: e.clientY });
        setSelectedNodeId(id);
        setShowPropertyPanel(true);
    };

    const handleOutputClick = (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        setLinkingSourceId(nodeId);
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            setTempEdgeEnd({ x: node.position.x + NODE_WIDTH, y: node.position.y + NODE_HEIGHT / 2 });
        }
    };

    const handleInputClick = (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        if (linkingSourceId && linkingSourceId !== nodeId) {
            // 检查是否已存在连接
            const exists = edges.some(e => e.source === linkingSourceId && e.target === nodeId);
            if (!exists) {
                const newEdge: AgentEdge = {
                    id: `e-${linkingSourceId}-${nodeId}`,
                    source: linkingSourceId,
                    target: nodeId
                };
                setEdges(prev => [...prev, newEdge]);
            }
        }
        setLinkingSourceId(null);
        setTempEdgeEnd(null);
    };

    const handleCanvasMouseUp = (e: React.MouseEvent) => {
        if (linkingSourceId && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const zoom = viewport.zoom || 1;
            const x = (e.clientX - rect.left - viewport.x) / zoom;
            const y = (e.clientY - rect.top - viewport.y) / zoom;
            setNodeMenuPosition({ x, y });
            setShowNodeMenu(true);
            setMenuSearch('');
        }
        setDraggingNodeId(null);
        setIsPanning(false);
    };

    // 全局鼠标移动
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isPanning) {
                const dx = e.clientX - lastMousePos.x;
                const dy = e.clientY - lastMousePos.y;
                setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
                setLastMousePos({ x: e.clientX, y: e.clientY });
            } else if (draggingNodeId) {
                const zoom = viewport.zoom || 1;
                const dx = (e.clientX - lastMousePos.x) / zoom;
                const dy = (e.clientY - lastMousePos.y) / zoom;
                setNodes(prev => prev.map(n => 
                    n.id === draggingNodeId 
                        ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } 
                        : n
                ));
                setLastMousePos({ x: e.clientX, y: e.clientY });
            } else if (linkingSourceId && canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                const zoom = viewport.zoom || 1;
                const x = (e.clientX - rect.left - viewport.x) / zoom;
                const y = (e.clientY - rect.top - viewport.y) / zoom;
                setTempEdgeEnd({ x, y });
            }
        };

        const handleMouseUp = () => {
            setDraggingNodeId(null);
            setIsPanning(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isPanning, draggingNodeId, linkingSourceId, lastMousePos, viewport]);

    // 缩放处理
    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setViewport(prev => ({
                ...prev,
                zoom: Math.min(Math.max(prev.zoom * delta, 0.25), 2)
            }));
        }
    };

    // 保存工作流
    const handleSave = () => {
        // 从工作流中提取系统提示词
        const promptNode = nodes.find(n => n.type === 'prompt');
        const updatedAgent = {
            ...agent,
            systemPrompt: promptNode?.data.systemPrompt || agent.systemPrompt
        };
        onSave(updatedAgent, { nodes, edges });
    };

    // 渲染节点
    const renderNode = (node: AgentNode) => {
        const styles = getNodeStyles(node.type);
        const isSelected = selectedNodeId === node.id;

        return (
            <div
                key={node.id}
                className={`absolute cursor-move select-none transition-shadow ${isSelected ? 'z-20' : 'z-10'}`}
                style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: NODE_WIDTH,
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
            >
                <div className={`
                    relative rounded-xl border-2 ${styles.border} ${styles.bg}
                    ${isSelected ? 'ring-2 ring-primary shadow-xl' : 'shadow-lg hover:shadow-xl'}
                    transition-all duration-200
                `}>
                    {/* 节点头部 */}
                    <div className="flex items-center gap-2 p-3 border-b border-white/10">
                        <div className={`p-1.5 rounded-lg ${styles.iconBg}`}>
                            {getNodeIcon(node.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-textMain truncate">{node.data.label}</p>
                            {node.data.description && (
                                <p className="text-[10px] text-textSecondary truncate">{node.data.description}</p>
                            )}
                        </div>
                        {node.type !== 'start' && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                                className="p-1 hover:bg-red-500/20 rounded text-textSecondary hover:text-red-500 transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>

                    {/* 节点内容预览 */}
                    <div className="p-3 min-h-[40px]">
                        {node.type === 'prompt' && (
                            <p className="text-[10px] text-textSecondary line-clamp-2">
                                {node.data.systemPrompt?.substring(0, 80) || '点击配置系统提示词...'}
                            </p>
                        )}
                        {node.type === 'condition' && (
                            <p className="text-[10px] text-textSecondary">
                                {node.data.condition?.variable 
                                    ? `${node.data.condition.variable} ${node.data.condition.operator} ${node.data.condition.value}`
                                    : '点击配置条件...'}
                            </p>
                        )}
                        {node.type === 'reply' && (
                            <p className="text-[10px] text-textSecondary line-clamp-2">
                                {node.data.replyContent || '{{llm_output}}'}
                            </p>
                        )}
                        {node.type === 'knowledge' && (
                            <p className="text-[10px] text-textSecondary">
                                {node.data.knowledgeFiles?.length 
                                    ? `${node.data.knowledgeFiles.length} 个文件`
                                    : '点击配置知识库...'}
                            </p>
                        )}
                        {node.type === 'start' && (
                            <p className="text-[10px] text-textSecondary">用户消息触发</p>
                        )}
                    </div>

                    {/* 输入连接点 */}
                    {node.type !== 'start' && (
                        <div 
                            className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-surface border-2 border-border rounded-full flex items-center justify-center cursor-pointer hover:border-primary hover:scale-110 transition-all"
                            onClick={(e) => handleInputClick(e, node.id)}
                        >
                            <div className="w-2 h-2 rounded-full bg-textSecondary" />
                        </div>
                    )}

                    {/* 输出连接点 */}
                    {node.type !== 'reply' && (
                        <div 
                            className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-surface border-2 border-border rounded-full flex items-center justify-center cursor-pointer hover:border-primary hover:scale-110 transition-all"
                            onClick={(e) => handleOutputClick(e, node.id)}
                        >
                            <ChevronRight size={14} className="text-textSecondary" />
                        </div>
                    )}

                    {/* 条件节点的多输出 */}
                    {node.type === 'condition' && (
                        <>
                            <div className="absolute -right-3 top-1/3 w-6 h-6 bg-emerald-500/20 border-2 border-emerald-500 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-all text-[8px] font-bold text-emerald-500">
                                是
                            </div>
                            <div className="absolute -right-3 top-2/3 w-6 h-6 bg-red-500/20 border-2 border-red-500 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-all text-[8px] font-bold text-red-500">
                                否
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // 渲染属性面板
    const renderPropertyPanel = () => {
        if (!selectedNode || !showPropertyPanel) return null;

        return (
            <div className="w-80 border-l border-border bg-surface flex flex-col">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <h4 className="font-bold text-textMain">{language === 'zh' ? '节点配置' : 'Node Settings'}</h4>
                    <button onClick={() => setShowPropertyPanel(false)}>
                        <X size={18} className="text-textSecondary hover:text-textMain" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* 节点标签 */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-textSecondary uppercase">
                            {language === 'zh' ? '节点名称' : 'Node Label'}
                        </label>
                        <input
                            type="text"
                            value={selectedNode.data.label}
                            onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                        />
                    </div>

                    {/* 系统提示词节点 */}
                    {selectedNode.type === 'prompt' && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-textSecondary uppercase">
                                {language === 'zh' ? '系统提示词' : 'System Prompt'}
                            </label>
                            <textarea
                                value={selectedNode.data.systemPrompt || ''}
                                onChange={(e) => updateNodeData(selectedNode.id, { systemPrompt: e.target.value })}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none h-64 font-mono resize-none"
                                placeholder={language === 'zh' ? '输入系统提示词...' : 'Enter system prompt...'}
                            />
                        </div>
                    )}

                    {/* 条件节点 */}
                    {selectedNode.type === 'condition' && (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">
                                    {language === 'zh' ? '变量名' : 'Variable'}
                                </label>
                                <input
                                    type="text"
                                    value={selectedNode.data.condition?.variable || ''}
                                    onChange={(e) => updateNodeData(selectedNode.id, { 
                                        condition: { ...selectedNode.data.condition, variable: e.target.value, operator: selectedNode.data.condition?.operator || 'equals', value: selectedNode.data.condition?.value || '' }
                                    })}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                    placeholder="user_input"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">
                                    {language === 'zh' ? '操作符' : 'Operator'}
                                </label>
                                <select
                                    value={selectedNode.data.condition?.operator || 'equals'}
                                    onChange={(e) => updateNodeData(selectedNode.id, { 
                                        condition: { ...selectedNode.data.condition, variable: selectedNode.data.condition?.variable || '', operator: e.target.value, value: selectedNode.data.condition?.value || '' }
                                    })}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                >
                                    <option value="equals">{language === 'zh' ? '等于' : 'Equals'}</option>
                                    <option value="contains">{language === 'zh' ? '包含' : 'Contains'}</option>
                                    <option value="not_empty">{language === 'zh' ? '不为空' : 'Not Empty'}</option>
                                    <option value="greater">{language === 'zh' ? '大于' : 'Greater Than'}</option>
                                    <option value="less">{language === 'zh' ? '小于' : 'Less Than'}</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">
                                    {language === 'zh' ? '比较值' : 'Value'}
                                </label>
                                <input
                                    type="text"
                                    value={selectedNode.data.condition?.value || ''}
                                    onChange={(e) => updateNodeData(selectedNode.id, { 
                                        condition: { ...selectedNode.data.condition, variable: selectedNode.data.condition?.variable || '', operator: selectedNode.data.condition?.operator || 'equals', value: e.target.value }
                                    })}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                    placeholder={language === 'zh' ? '输入比较值' : 'Enter value'}
                                />
                            </div>
                        </>
                    )}

                    {/* 回复节点 */}
                    {selectedNode.type === 'reply' && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-textSecondary uppercase">
                                {language === 'zh' ? '回复内容' : 'Reply Content'}
                            </label>
                            <textarea
                                value={selectedNode.data.replyContent || '{{llm_output}}'}
                                onChange={(e) => updateNodeData(selectedNode.id, { replyContent: e.target.value })}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none h-32 font-mono resize-none"
                                placeholder={language === 'zh' ? '使用 {{variable}} 引用变量' : 'Use {{variable}} to reference variables'}
                            />
                            <p className="text-[10px] text-textSecondary">
                                {language === 'zh' ? '可用变量：{{user_input}}, {{llm_output}}, {{context}}' : 'Available: {{user_input}}, {{llm_output}}, {{context}}'}
                            </p>
                        </div>
                    )}

                    {/* 变量节点 */}
                    {selectedNode.type === 'variable' && (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">
                                    {language === 'zh' ? '变量名' : 'Variable Name'}
                                </label>
                                <input
                                    type="text"
                                    value={selectedNode.data.variableName || ''}
                                    onChange={(e) => updateNodeData(selectedNode.id, { variableName: e.target.value })}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                    placeholder="my_variable"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">
                                    {language === 'zh' ? '变量值' : 'Value'}
                                </label>
                                <textarea
                                    value={selectedNode.data.variableValue || ''}
                                    onChange={(e) => updateNodeData(selectedNode.id, { variableValue: e.target.value })}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none h-24 font-mono resize-none"
                                    placeholder={language === 'zh' ? '变量值或表达式' : 'Value or expression'}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="flex-1 flex flex-col bg-background">
                {/* 顶部工具栏 */}
                <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-surface">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="p-2 hover:bg-background rounded-lg transition-colors">
                            <X size={20} className="text-textSecondary" />
                        </button>
                        <div>
                            <h3 className="font-bold text-textMain">{agent.name}</h3>
                            <p className="text-[10px] text-textSecondary">
                                {language === 'zh' ? '工作流编辑器' : 'Workflow Editor'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-textSecondary px-3 py-1 bg-background rounded-lg">
                            {language === 'zh' ? `${nodes.length} 个节点` : `${nodes.length} nodes`}
                        </span>
                        <button 
                            onClick={handleSave}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:brightness-110 transition-all"
                        >
                            <Save size={16} /> {language === 'zh' ? '保存' : 'Save'}
                        </button>
                    </div>
                </div>

                {/* 主内容区 */}
                <div className="flex-1 flex overflow-hidden">
                    {/* 左侧节点面板 */}
                    <div className="w-56 border-r border-border bg-surface p-3 space-y-2 overflow-y-auto">
                        <p className="text-xs font-bold text-textSecondary uppercase px-2 mb-3">
                            {language === 'zh' ? '拖拽添加节点' : 'Drag to Add'}
                        </p>
                        {nodeTypes.map(nodeType => {
                            const styles = getNodeStyles(nodeType.type);
                            return (
                                <div
                                    key={nodeType.type}
                                    className={`p-3 rounded-lg border ${styles.border} ${styles.bg} cursor-pointer hover:scale-[1.02] transition-all`}
                                    onClick={() => {
                                        const newNode: AgentNode = {
                                            id: `${nodeType.type}-${Date.now()}`,
                                            type: nodeType.type,
                                            position: { x: 300 + Math.random() * 100, y: 200 + Math.random() * 100 },
                                            data: { 
                                                label: language === 'zh' ? nodeType.labelZh : nodeType.label,
                                                description: nodeType.description
                                            }
                                        };
                                        setNodes(prev => [...prev, newNode]);
                                        setSelectedNodeId(newNode.id);
                                        setShowPropertyPanel(true);
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-lg ${styles.iconBg}`}>
                                            {getNodeIcon(nodeType.type)}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-textMain">
                                                {language === 'zh' ? nodeType.labelZh : nodeType.label}
                                            </p>
                                            <p className="text-[9px] text-textSecondary">{nodeType.description}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 画布区域 */}
                    <div 
                        ref={canvasRef}
                        className="flex-1 relative overflow-hidden bg-[#0a0a0f] canvas-bg"
                        onMouseDown={handleCanvasMouseDown}
                        onMouseUp={handleCanvasMouseUp}
                        onWheel={handleWheel}
                        style={{ cursor: isPanning ? 'grabbing' : (linkingSourceId ? 'crosshair' : 'default') }}
                    >
                        {/* 网格背景 */}
                        <div 
                            className="absolute inset-0 opacity-20 pointer-events-none canvas-bg"
                            style={{
                                backgroundImage: `
                                    linear-gradient(to right, #333 1px, transparent 1px),
                                    linear-gradient(to bottom, #333 1px, transparent 1px)
                                `,
                                backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
                                backgroundPosition: `${viewport.x}px ${viewport.y}px`
                            }}
                        />

                        {/* 变换容器 */}
                        <div
                            className="absolute"
                            style={{
                                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                                transformOrigin: '0 0'
                            }}
                        >
                            {/* 渲染边 */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                                <defs>
                                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                        <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
                                    </marker>
                                </defs>
                                {edges.map(edge => {
                                    const sourceNode = nodes.find(n => n.id === edge.source);
                                    const targetNode = nodes.find(n => n.id === edge.target);
                                    if (!sourceNode || !targetNode) return null;

                                    const sourceX = sourceNode.position.x + NODE_WIDTH;
                                    const sourceY = sourceNode.position.y + NODE_HEIGHT / 2;
                                    const targetX = targetNode.position.x;
                                    const targetY = targetNode.position.y + NODE_HEIGHT / 2;

                                    return (
                                        <g key={edge.id} className="cursor-pointer group">
                                            <path
                                                d={getEdgePath(sourceX, sourceY, targetX, targetY)}
                                                stroke="#666"
                                                strokeWidth="2"
                                                fill="none"
                                                markerEnd="url(#arrowhead)"
                                                className="transition-all group-hover:stroke-primary"
                                            />
                                            {/* 删除按钮 */}
                                            <circle
                                                cx={(sourceX + targetX) / 2}
                                                cy={(sourceY + targetY) / 2}
                                                r="8"
                                                fill="#ef4444"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer pointer-events-auto"
                                                onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }}
                                            />
                                            <text
                                                x={(sourceX + targetX) / 2}
                                                y={(sourceY + targetY) / 2 + 4}
                                                textAnchor="middle"
                                                fill="white"
                                                fontSize="10"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                                            >
                                                ×
                                            </text>
                                        </g>
                                    );
                                })}
                                
                                {/* 临时连线 */}
                                {linkingSourceId && tempEdgeEnd && (
                                    <path
                                        d={getEdgePath(
                                            (nodes.find(n => n.id === linkingSourceId)?.position.x || 0) + NODE_WIDTH,
                                            (nodes.find(n => n.id === linkingSourceId)?.position.y || 0) + NODE_HEIGHT / 2,
                                            tempEdgeEnd.x,
                                            tempEdgeEnd.y
                                        )}
                                        stroke="#888"
                                        strokeWidth="2"
                                        strokeDasharray="5,5"
                                        fill="none"
                                    />
                                )}
                            </svg>

                            {/* 渲染节点 */}
                            {nodes.map(renderNode)}
                        </div>

                        {/* 节点添加菜单 */}
                        {showNodeMenu && (
                            <div 
                                className="absolute z-50 bg-surface border border-border rounded-xl shadow-2xl w-64 overflow-hidden"
                                style={{ 
                                    left: nodeMenuPosition.x * viewport.zoom + viewport.x,
                                    top: nodeMenuPosition.y * viewport.zoom + viewport.y
                                }}
                            >
                                <div className="p-3 border-b border-border">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary" />
                                        <input
                                            type="text"
                                            value={menuSearch}
                                            onChange={(e) => setMenuSearch(e.target.value)}
                                            placeholder={language === 'zh' ? '搜索节点...' : 'Search nodes...'}
                                            className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-textMain focus:border-primary outline-none"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <div className="max-h-64 overflow-y-auto p-2">
                                    {nodeTypes
                                        .filter(n => 
                                            n.label.toLowerCase().includes(menuSearch.toLowerCase()) ||
                                            n.labelZh.includes(menuSearch)
                                        )
                                        .map(nodeType => {
                                            const styles = getNodeStyles(nodeType.type);
                                            return (
                                                <button
                                                    key={nodeType.type}
                                                    onClick={() => addNode(nodeType.type)}
                                                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-background transition-colors text-left"
                                                >
                                                    <div className={`p-1.5 rounded-lg ${styles.iconBg}`}>
                                                        {getNodeIcon(nodeType.type)}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-textMain">
                                                            {language === 'zh' ? nodeType.labelZh : nodeType.label}
                                                        </p>
                                                        <p className="text-[9px] text-textSecondary">{nodeType.description}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                </div>
                                <div className="p-2 border-t border-border">
                                    <button
                                        onClick={() => { setShowNodeMenu(false); setLinkingSourceId(null); setTempEdgeEnd(null); }}
                                        className="w-full px-3 py-1.5 text-xs text-textSecondary hover:bg-background rounded-lg transition-colors"
                                    >
                                        {language === 'zh' ? '取消' : 'Cancel'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 缩放指示器 */}
                        <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-surface/80 backdrop-blur-sm border border-border rounded-lg text-xs text-textSecondary">
                            {Math.round(viewport.zoom * 100)}%
                        </div>

                        {/* 操作提示 */}
                        <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-surface/80 backdrop-blur-sm border border-border rounded-lg text-[10px] text-textSecondary">
                            {language === 'zh' 
                                ? 'Alt+拖拽平移 | 滚轮缩放 | 点击节点编辑'
                                : 'Alt+Drag to pan | Scroll to zoom | Click node to edit'}
                        </div>
                    </div>

                    {/* 右侧属性面板 */}
                    {renderPropertyPanel()}
                </div>
            </div>
        </div>
    );
};

export default AgentWorkflowEditor;


