import React, { useState, useRef, useEffect } from 'react';
import { Agent, Language } from '../types';
import { translations } from '../utils/translations';
import { api } from '../utils/api';
import { storage } from '../utils/storage';
import {
    Play, BrainCircuit, Database, GitBranch,
    Terminal, Plus, Settings, ChevronRight, ChevronDown,
    FileText, Zap, Variable, Bot, Send,
    ArrowLeft, Loader2, Clock,
    MoreHorizontal, Minus, Info, Trash2
} from 'lucide-react';

// ==================== 类型定义 ====================
type AgentNodeType = 'start' | 'agent' | 'llm' | 'knowledge' | 'condition' | 'reply' | 'variable' | 'tool';

interface AgentNode {
    id: string;
    type: AgentNodeType;
    position: { x: number; y: number };
    data: {
        label: string;
        description?: string;
        // Agent 节点特有
        modelId?: string;
        scenario?: string;
        systemPrompt?: string;
        skills?: string[];
        suggestions?: string[];
        // 其他节点
        knowledgeFiles?: string[];
        condition?: { variable: string; operator: string; value: string };
        replyContent?: string;
        variableName?: string;
        variableValue?: string;
    };
}

interface AgentEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
}

interface Skill {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
}

// VariableItem 接口暂时移除（未实现功能）

interface KnowledgeFileMeta {
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    uploadedAt?: string;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface AgentBuilderProps {
    agent: Agent;
    onClose: () => void;
    onSave: (agent: Agent) => void | Promise<void>;
    language: Language;
}

// ==================== 常量 ====================
const NODE_WIDTH = 280;
const NODE_HEIGHT = 100;
const DRAFT_SAVE_DELAY = 1500; // 草稿保存防抖延迟（毫秒）
const DRAFT_STORAGE_KEY = 'agent-builder-draft';

// 兼容：默认模型列表（实际以 system settings / localStorage 为准）
const DEFAULT_MODELS = [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite' },
];

// 草稿数据结构
interface DraftData {
    agentId: string;
    agentName: string;
    personaPrompt: string;
    welcomeMessage: string;
    selectedModel: string;
    nodes: AgentNode[];
    edges: AgentEdge[];
    savedAt: number;
}

// 暂时移除未实现的功能常量（触发器、记忆、变量、数据库）
// 后续实现时再添加

// ==================== 工具函数 ====================
const getEdgePath = (sx: number, sy: number, tx: number, ty: number) => {
    if (Number.isNaN(sx) || Number.isNaN(sy) || Number.isNaN(tx) || Number.isNaN(ty)) return '';
    const midX = (sx + tx) / 2;
    return `M${sx},${sy} C${midX},${sy} ${midX},${ty} ${tx},${ty}`;
};

const createDefaultWorkflow = (agent: Agent, defaultModelId?: string): { nodes: AgentNode[]; edges: AgentEdge[] } => {
    const nodes: AgentNode[] = [
        {
            id: 'start',
            type: 'start',
            position: { x: 120, y: 260 },
            data: { label: '开始', description: '用户消息触发' }
        },
        {
            id: 'agent-1',
            type: 'agent',
            position: { x: 520, y: 200 },
            data: {
                label: agent.name || 'Agent',
                modelId: defaultModelId || storage.loadModelName?.() || '',
                scenario: '处理用户对话并给出答复。',
                systemPrompt: agent.systemPrompt || '',
            }
        }
    ];
    const edges: AgentEdge[] = [{ id: 'e-start-agent-1', source: 'start', target: 'agent-1' }];
    return { nodes, edges };
};

// ==================== 主组件 ====================
const AgentBuilder: React.FC<AgentBuilderProps> = ({ agent, onClose, onSave, language }) => {
    const t = translations[language]?.common || translations['en'].common;
    const canvasRef = useRef<HTMLDivElement>(null);
    const hasCheckedDraft = useRef(false);  // 防止 React 18 Strict Mode 重复执行

    // ==================== 状态管理 ====================
    // 智能体配置
    const [agentName, setAgentName] = useState(agent.name);
    const [personaPrompt, setPersonaPrompt] = useState(agent.systemPrompt || '');
    const [welcomeMessage, setWelcomeMessage] = useState(agent.welcomeMessage || '');
    const [availableModels, setAvailableModels] = useState(() => storage.loadAvailableModels());
    const [allowModelSelect, setAllowModelSelect] = useState(true);
    const [selectedModel, setSelectedModel] = useState(() => storage.loadModelName());
    
    // 技能配置
    const [skills, setSkills] = useState<Skill[]>([]);
    
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isPersonaDrawerOpen, setIsPersonaDrawerOpen] = useState(false);
    const [personaDraft, setPersonaDraft] = useState('');

    // 折叠状态（暂时移除未实现的 triggers/memory/variables/database）
    const [expandedSections, setExpandedSections] = useState({
        persona: true,
        skills: false,
    });

    // 工作流
    const initialWf = createDefaultWorkflow(agent, storage.loadModelName());
    const [nodes, setNodes] = useState<AgentNode[]>(initialWf.nodes);
    const [edges, setEdges] = useState<AgentEdge[]>(initialWf.edges);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>('agent-1');
    
    // 画布
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    
    // 连线
    const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);
    const [tempEdgeEnd, setTempEdgeEnd] = useState<{ x: number; y: number } | null>(null);

    // 预览与调试
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
    const [previewInitError, setPreviewInitError] = useState<string | null>(null);
    const [isChatPinnedToBottom, setIsChatPinnedToBottom] = useState(true);

    // 保存状态
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    
    // 草稿自动保存
    const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
    const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 知识库文件（真实数据）
    const [kbFiles, setKbFiles] = useState<KnowledgeFileMeta[]>([]);
    const [kbLoading, setKbLoading] = useState(false);
    const [kbError, setKbError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [kbPreview, setKbPreview] = useState<{ fileName: string; content: string } | null>(null);
    const [kbPreviewLoading, setKbPreviewLoading] = useState(false);

    // ==================== 草稿自动保存功能 ====================
    // 保存草稿到 localStorage
    const saveDraft = () => {
        const draft: DraftData = {
            agentId: agent.id,
            agentName,
            personaPrompt,
            welcomeMessage,
            selectedModel,
            nodes,
            edges,
            savedAt: Date.now(),
        };
        try {
            localStorage.setItem(`${DRAFT_STORAGE_KEY}-${agent.id}`, JSON.stringify(draft));
            setDraftSavedAt(new Date());
        } catch (e) {
            console.warn('草稿保存失败:', e);
        }
    };

    // 防抖保存草稿
    const debouncedSaveDraft = () => {
        if (draftSaveTimerRef.current) {
            clearTimeout(draftSaveTimerRef.current);
        }
        draftSaveTimerRef.current = setTimeout(() => {
            saveDraft();
        }, DRAFT_SAVE_DELAY);
    };

    // 从 localStorage 恢复草稿
    const loadDraft = (): DraftData | null => {
        try {
            const saved = localStorage.getItem(`${DRAFT_STORAGE_KEY}-${agent.id}`);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('草稿读取失败:', e);
        }
        return null;
    };

    // 清除草稿
    const clearDraft = () => {
        try {
            localStorage.removeItem(`${DRAFT_STORAGE_KEY}-${agent.id}`);
            setDraftSavedAt(null);
        } catch (e) {
            console.warn('草稿清除失败:', e);
        }
    };

    // 当内容变化时触发草稿保存
    useEffect(() => {
        debouncedSaveDraft();
        return () => {
            if (draftSaveTimerRef.current) {
                clearTimeout(draftSaveTimerRef.current);
            }
        };
    }, [agentName, personaPrompt, welcomeMessage, selectedModel, nodes, edges]);

    // 初始化：从真实 agent + 后端工作流/知识库加载
    useEffect(() => {
        // 防止 React 18 Strict Mode 重复执行草稿确认框
        let hasDraft = false;
        
        if (!hasCheckedDraft.current) {
            hasCheckedDraft.current = true;
            
            // 先检查是否有本地草稿
            const draft = loadDraft();
            hasDraft = !!(draft && draft.agentId === agent.id && draft.savedAt > 0);
            
            // 如果有草稿，询问是否恢复
            if (hasDraft && draft) {
                const draftTime = new Date(draft.savedAt).toLocaleString();
                const shouldRestore = window.confirm(
                    `检测到本地草稿（${draftTime}保存）\n\n是否恢复草稿内容？\n\n点击"确定"恢复草稿，点击"取消"使用服务器数据。`
                );
                if (shouldRestore) {
                    setAgentName(draft.agentName);
                    setPersonaPrompt(draft.personaPrompt);
                    setPersonaDraft(draft.personaPrompt);
                    setWelcomeMessage(draft.welcomeMessage || '');
                    setSelectedModel(draft.selectedModel);
                    setNodes(draft.nodes);
                    setEdges(draft.edges);
                    setDraftSavedAt(new Date(draft.savedAt));
                    setSelectedNodeId(draft.nodes.find(n => n.type === 'agent')?.id || draft.nodes[0]?.id || null);
                    // 仍然需要加载其他数据（知识库、预览会话等）
                } else {
                    // 用户选择不恢复，清除草稿
                    clearDraft();
                    setAgentName(agent.name);
                    setPersonaPrompt(agent.systemPrompt || '');
                    setPersonaDraft(agent.systemPrompt || '');
                    hasDraft = false;  // 标记为无草稿，后续正常加载
                }
            } else {
                setAgentName(agent.name);
                setPersonaPrompt(agent.systemPrompt || '');
                setPersonaDraft(agent.systemPrompt || '');
            }
        }
        
        // 默认先用本地缓存，随后会用后台 system-settings 覆盖
        if (!hasDraft) {
            setAvailableModels(storage.loadAvailableModels());
            setSelectedModel(storage.loadModelName());
        }
        setSaveError(null);

        const load = async () => {
            // 0) Load system settings for model config (后台配置)
            try {
                const settings = await api.systemSettings.get();
                setAllowModelSelect(settings.allowModelSelect ?? true);
                if (Array.isArray(settings.availableModels) && settings.availableModels.length > 0) {
                    setAvailableModels(settings.availableModels);
                    storage.saveAvailableModels?.(settings.availableModels);
                }
                const defaultModel = settings.modelName || storage.loadModelName();
                if (defaultModel && !hasDraft) {
                    setSelectedModel(defaultModel);
                    storage.saveModelName?.(defaultModel);
                }
            } catch (e) {
                // 不要白屏：失败时保留本地缓存
                console.warn('Failed to load system settings for AgentBuilder:', e);
            }

            // 1) Load workflow graph（如果没有恢复草稿）
            if (!hasDraft) {
                try {
                    const wf = await api.agents.getWorkflow(agent.id);
                    if (wf?.nodes?.length) {
                        setNodes(wf.nodes);
                        setEdges(wf.edges || []);
                        setSelectedNodeId(wf.nodes.find((n: any) => n.type === 'agent')?.id || wf.nodes[0]?.id || null);
                    } else {
                        const def = createDefaultWorkflow(agent, storage.loadModelName());
                        setNodes(def.nodes);
                        setEdges(def.edges);
                        setSelectedNodeId('agent-1');
                    }
                } catch (e: any) {
                    console.warn('Failed to load agent workflow, fallback to default:', e?.message || e);
                    const def = createDefaultWorkflow(agent, storage.loadModelName());
                    setNodes(def.nodes);
                    setEdges(def.edges);
                    setSelectedNodeId('agent-1');
                }
            }

            // 2) Load agent knowledge base files
            setKbLoading(true);
            setKbError(null);
            try {
                const files = await api.files.getAll({ agentId: agent.id });
                setKbFiles(
                    (files || []).map((f: any) => ({
                        id: f.id,
                        fileName: f.fileName,
                        fileType: f.fileType,
                        fileSize: f.fileSize,
                        uploadedAt: f.uploadedAt,
                    }))
                );
            } catch (e: any) {
                setKbError(e?.message || '加载知识库失败');
            } finally {
                setKbLoading(false);
            }

            // 3) Create a preview session for SSE chat (use backend configured model/provider)
            try {
                setPreviewInitError(null);
                const session = await api.sessions.create({
                    title: `Agent Preview: ${agent.name || agent.id}`,
                    isGroup: false,
                    participants: [agent.id],
                });
                setPreviewSessionId(session.id);
            } catch (e: any) {
                setPreviewInitError(e?.message || '预览会话创建失败（请检查是否已登录/后端是否启动）');
                setPreviewSessionId(null);
            }
        };

        load();
    }, [agent.id]);

    const openPersonaDrawer = () => {
        setPersonaDraft(personaPrompt);
        setIsPersonaDrawerOpen(true);
    };

    const closePersonaDrawer = () => {
        setIsPersonaDrawerOpen(false);
        setPersonaDraft(personaPrompt);
    };

    const savePersonaDrawer = () => {
        setPersonaPrompt(personaDraft);
        setIsPersonaDrawerOpen(false);
    };

    const savePersonaAndPublish = async () => {
        setPersonaPrompt(personaDraft);
        setIsPersonaDrawerOpen(false);
        await handleSave();
    };

    // ==================== 获取选中的节点 ====================
    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    // ==================== 节点样式 ====================
    const getNodeStyles = (type: AgentNodeType, isSelected: boolean) => {
        const baseStyles = {
            start: { bg: 'bg-[#7C5CFC]/10', border: 'border-[#7C5CFC]', icon: 'bg-[#7C5CFC]' },
            agent: { bg: 'bg-[#3B82F6]/10', border: 'border-[#3B82F6]', icon: 'bg-[#3B82F6]' },
            llm: { bg: 'bg-[#8B5CF6]/10', border: 'border-[#8B5CF6]', icon: 'bg-[#8B5CF6]' },
            knowledge: { bg: 'bg-[#F59E0B]/10', border: 'border-[#F59E0B]', icon: 'bg-[#F59E0B]' },
            condition: { bg: 'bg-[#06B6D4]/10', border: 'border-[#06B6D4]', icon: 'bg-[#06B6D4]' },
            reply: { bg: 'bg-[#10B981]/10', border: 'border-[#10B981]', icon: 'bg-[#10B981]' },
            variable: { bg: 'bg-[#EC4899]/10', border: 'border-[#EC4899]', icon: 'bg-[#EC4899]' },
            tool: { bg: 'bg-[#F97316]/10', border: 'border-[#F97316]', icon: 'bg-[#F97316]' },
        };
        return baseStyles[type] || baseStyles.agent;
    };

    const getNodeIcon = (type: AgentNodeType) => {
        switch (type) {
            case 'start': return <Play size={14} className="text-white fill-white" />;
            case 'agent': return <Bot size={14} className="text-white" />;
            case 'llm': return <BrainCircuit size={14} className="text-white" />;
            case 'knowledge': return <Database size={14} className="text-white" />;
            case 'condition': return <GitBranch size={14} className="text-white" />;
            case 'reply': return <Send size={14} className="text-white" />;
            case 'variable': return <Variable size={14} className="text-white" />;
            case 'tool': return <Terminal size={14} className="text-white" />;
            default: return <Zap size={14} className="text-white" />;
        }
    };

    // ==================== 折叠区域切换 ====================
    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // ==================== 画布事件处理 ====================
    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            setIsPanning(true);
            setLastMousePos({ x: e.clientX, y: e.clientY });
            e.preventDefault();
            return;
        }
        if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-bg')) {
            setSelectedNodeId(null);
        }
    };

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        setDraggingNodeId(id);
        setLastMousePos({ x: e.clientX, y: e.clientY });
        setSelectedNodeId(id);
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
            const exists = edges.some(ed => ed.source === linkingSourceId && ed.target === nodeId);
            if (!exists) {
                setEdges(prev => [...prev, {
                    id: `e-${linkingSourceId}-${nodeId}`,
                    source: linkingSourceId,
                    target: nodeId
                }]);
            }
        }
        setLinkingSourceId(null);
        setTempEdgeEnd(null);
    };

    // ==================== 全局鼠标事件 ====================
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
            setLinkingSourceId(null);
            setTempEdgeEnd(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isPanning, draggingNodeId, linkingSourceId, lastMousePos, viewport]);

    // ==================== 缩放 ====================
    const handleZoom = (delta: number) => {
        setViewport(prev => ({
            ...prev,
            zoom: Math.min(Math.max(prev.zoom + delta, 0.25), 2)
        }));
    };

    // ==================== 添加节点 ====================
    const addNode = (type: AgentNodeType) => {
        const newNode: AgentNode = {
            id: `${type}-${Date.now()}`,
            type,
            position: {
                x: 300 + Math.random() * 100 - viewport.x / viewport.zoom,
                y: 200 + Math.random() * 100 - viewport.y / viewport.zoom
            },
            data: {
                label: type === 'agent' ? `Agent_${Math.floor(Math.random() * 1000)}` : type,
                description: ''
            }
        };
        setNodes(prev => [...prev, newNode]);
        setSelectedNodeId(newNode.id);
    };

    // ==================== 删除节点 ====================
    const deleteNode = (id: string) => {
        if (id === 'start') return;
        setNodes(prev => prev.filter(n => n.id !== id));
        setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
        if (selectedNodeId === id) setSelectedNodeId(null);
    };

    // ==================== 更新节点数据 ====================
    const updateNodeData = (id: string, data: Partial<AgentNode['data']>) => {
        setNodes(prev => prev.map(n =>
            n.id === id ? { ...n, data: { ...n.data, ...data } } : n
        ));
    };

    const refreshKbFiles = async () => {
        setKbLoading(true);
        setKbError(null);
        try {
            const files = await api.files.getAll({ agentId: agent.id });
            setKbFiles(
                (files || []).map((f: any) => ({
                    id: f.id,
                    fileName: f.fileName,
                    fileType: f.fileType,
                    fileSize: f.fileSize,
                    uploadedAt: f.uploadedAt,
                }))
            );
        } catch (e: any) {
            setKbError(e?.message || '加载知识库失败');
        } finally {
            setKbLoading(false);
        }
    };

    const readFileAsBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                // result is dataURL: "data:<mime>;base64,xxx"
                const base64 = result.split(',')[1] || '';
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleUploadFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setKbError(null);
        setKbLoading(true);
        try {
            for (const file of Array.from(files)) {
                const base64 = await readFileAsBase64(file);
                await api.files.upload({
                    fileName: file.name,
                    fileType: file.type || 'application/octet-stream',
                    fileContent: base64,
                    agentId: agent.id,
                });
            }
            await refreshKbFiles();
        } catch (e: any) {
            setKbError(e?.message || '上传失败');
        } finally {
            setKbLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handlePreviewFile = async (fileId: string) => {
        setKbPreviewLoading(true);
        try {
            const data = await api.files.getContent(fileId);
            setKbPreview({ fileName: data.fileName, content: data.content || '' });
        } catch (e: any) {
            setKbError(e?.message || '读取文件失败');
        } finally {
            setKbPreviewLoading(false);
        }
    };

    const handleDeleteFile = async (fileId: string, fileName?: string) => {
        // 确认删除
        const confirmMsg = fileName 
            ? `确定要删除文件 "${fileName}" 吗？` 
            : '确定要删除这个文件吗？';
        if (!window.confirm(confirmMsg)) {
            return;
        }
        
        setKbError(null);
        try {
            console.log('正在删除文件:', fileId);
            await api.files.delete(fileId);
            console.log('文件删除成功，刷新列表');
            // 先从本地状态移除，提供即时反馈
            setKbFiles(prev => prev.filter(f => f.id !== fileId));
            // 然后从服务器重新加载确保同步
            await refreshKbFiles();
        } catch (e: any) {
            console.error('删除文件失败:', e);
            const errMsg = e?.message || e?.error || '删除失败，请重试';
            setKbError(errMsg);
            // 删除失败，重新加载列表恢复状态
            await refreshKbFiles();
        }
    };

    // ==================== 聊天功能 ====================
    const sendMessage = async () => {
        if (!chatInput.trim()) return;
        if (isTyping) return;
        if (!previewSessionId) {
            setChatMessages(prev => [
                ...prev,
                {
                    id: `${Date.now()}-err`,
                    role: 'assistant',
                    content: previewInitError || '预览会话未就绪，请稍后重试。',
                    timestamp: Date.now(),
                }
            ]);
            return;
        }
        
        const input = chatInput.trim();
        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: Date.now()
        };

        const assistantId = `${Date.now()}-assistant`;
        const placeholderAssistant: ChatMessage = {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: Date.now()
        };

        setChatMessages(prev => [...prev, userMessage, placeholderAssistant]);
        setChatInput('');
        setIsTyping(true);

        try {
            // 🔥 传入当前页面的 personaPrompt，这样修改后可以直接测试，不需要先发布
            const response = await api.messages.send(previewSessionId, input, {
                agentId: agent.id,
                modelOverride: selectedModel,
                systemPromptOverride: personaPrompt,  // 使用当前编辑的人设
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ''}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('Failed to get response reader');

            const decoder = new TextDecoder();
            let buffer = '';
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (value) buffer += decoder.decode(value, { stream: true });
                if (done) break;

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.substring(6));
                        if (data.type === 'chunk') {
                            accumulatedText += data.content || '';
                            setChatMessages(prev =>
                                prev.map(m => (m.id === assistantId ? { ...m, content: accumulatedText } : m))
                            );
                        }
                    } catch {
                        // ignore parse errors (heartbeats / partial)
                    }
                }
            }

            // flush remaining
            const restLines = buffer.split('\n');
            for (const line of restLines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const data = JSON.parse(line.substring(6));
                    if (data.type === 'chunk') accumulatedText += data.content || '';
                } catch {
                    // ignore
                }
            }
            setChatMessages(prev =>
                prev.map(m => (m.id === assistantId ? { ...m, content: accumulatedText } : m))
            );
        } catch (error) {
            setChatMessages(prev =>
                prev.map(m =>
                    m.id === assistantId ? { ...m, content: `抱歉，发生了错误：${(error as any)?.message || '请稍后重试。'}` } : m
                )
            );
        } finally {
            setIsTyping(false);
        }
    };

    const scrollChatToBottom = () => {
        const el = chatContainerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    };

    const handleChatScroll = () => {
        const el = chatContainerRef.current;
        if (!el) return;
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setIsChatPinnedToBottom(distanceToBottom < 80);
    };

    // 仅在“贴近底部”时自动跟随（避免你手动滚动被抢回去）
    useEffect(() => {
        if (!isChatPinnedToBottom) return;
        // 使用 rAF 更丝滑
        requestAnimationFrame(scrollChatToBottom);
    }, [chatMessages, isChatPinnedToBottom]);

    // ==================== 保存 ====================
    const handleSave = async () => {
        setIsSaving(true);
        setSaveError(null);

        const updatedAgent: Agent = {
            ...agent,
            name: agentName,
            systemPrompt: personaPrompt,
            welcomeMessage: welcomeMessage,
        };

        try {
            // 1) 先尝试保存工作流（如果表不存在会返回 500，我们捕获但不阻塞主流程）
            try {
                await api.agents.updateWorkflow(agent.id, { nodes, edges });
            } catch (wfErr: any) {
                console.warn('工作流保存失败（可能表未创建）:', wfErr?.message);
                // 工作流保存失败不阻塞主保存
            }
            // 2) 交给上层保存 agent（复用你现有的 handleSaveAgent 链路）
            await onSave(updatedAgent);
            setLastSaved(new Date());
            setSaveError(null);
            // 🔥 发布成功后清除本地草稿
            clearDraft();
        } catch (e: any) {
            console.error('保存智能体失败:', e);
            const errMsg = e?.message || e?.error || '保存失败，请检查网络或登录状态';
            setSaveError(errMsg);
        } finally {
            setIsSaving(false);
        }
    };

    // ==================== 自动保存提示 ====================
    const formatDraftSaved = () => {
        if (!draftSavedAt) return '';
        return `草稿自动保存于 ${draftSavedAt.toLocaleTimeString()}`;
    };
    
    const formatLastPublished = () => {
        if (!lastSaved) return '';
        return `已发布于 ${lastSaved.toLocaleTimeString()}`;
    };

    // ==================== 渲染左侧面板 ====================
    const renderLeftPanel = () => (
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
            {/* 编排标题 */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">编排</span>
                </div>
                <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                    <Settings size={16} />
                    <span>对话设置</span>
                    <ChevronRight size={14} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* 人设与回复逻辑 */}
                <div className="border-b border-gray-100">
                    <button
                        type="button"
                        onClick={() => toggleSection('persona')}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                    >
                        <div className="flex items-center gap-2">
                            {expandedSections.persona ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <span className="font-medium text-gray-800">人设与回复逻辑</span>
                        </div>
                        <span
                            onClick={(e) => {
                                e.stopPropagation();
                                openPersonaDrawer();
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg cursor-pointer"
                            title="展开编辑"
                        >
                            展开
                        </span>
                    </button>
                    {expandedSections.persona && (
                        <div className="px-4 pb-4 space-y-4">
                            {/* 欢迎语 */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    👋 开场欢迎语
                                </label>
                                <textarea
                                    value={welcomeMessage}
                                    onChange={e => setWelcomeMessage(e.target.value)}
                                    placeholder="你好！我是你的AI助手，有什么可以帮你的？"
                                    className="w-full h-20 p-3 text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-lg resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-gray-50"
                                />
                                <p className="text-xs text-gray-400 mt-1">用户进入对话时自动发送的欢迎消息</p>
                            </div>

                            {/* 人设提示词 */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    🤖 人设提示词
                                </label>
                                <textarea
                                    value={personaPrompt}
                                    onChange={e => setPersonaPrompt(e.target.value)}
                                    placeholder="你是一个专业的AI助手..."
                                    className="w-full h-48 p-3 text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-lg resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-gray-50"
                                />
                            </div>

                            <div className="text-xs text-gray-500 space-y-1">
                                <p><span className="text-orange-500">知识边界：</span>仅使用用户本次提供的知识库内容回答问题，禁止编造或推测知识库之外的信息。</p>
                                <p><span className="text-blue-500">语气：</span>友好、简洁、口语化，避免冗长。</p>
                                <p className="font-medium mt-2">输出格式：</p>
                                <p className="text-emerald-600">1) 如果知识库中有对应答案，直接给出 30~80 字的核心回答</p>
                                <p className="text-amber-600">2) 如果知识库中无对应答案，可以使用AI拟人化语言结合知识库的资料进行随意恢复"尽量拟人化</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* 技能 */}
                <div className="border-b border-gray-100">
                    <button
                        onClick={() => toggleSection('skills')}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                    >
                        <div className="flex items-center gap-2">
                            {expandedSections.skills ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <span className="font-medium text-gray-800">技能</span>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                fileInputRef.current?.click();
                            }}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
                            title="上传知识库文件"
                        >
                            <Plus size={16} />
                        </button>
                    </button>
                    {expandedSections.skills && (
                        <div className="px-4 pb-4">
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".txt,.md,.json,.csv,.xml,.yaml,.yml"
                                className="hidden"
                                onChange={(e) => handleUploadFiles(e.target.files)}
                            />

                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-gray-500">知识库文件（用于检索/RAG）</span>
                                {kbLoading && <span className="text-xs text-gray-400">加载中...</span>}
                            </div>

                            {kbError && (
                                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1 mb-2">
                                    {kbError}
                                </div>
                            )}

                            {kbFiles.length === 0 && !kbLoading ? (
                                <div className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3">
                                    暂无知识库文件，点击右上角 “+” 上传。
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {kbFiles.map(f => (
                                        <div key={f.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                            <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center">
                                                <FileText size={12} className="text-blue-600" />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handlePreviewFile(f.id)}
                                                className="flex-1 text-left text-sm text-gray-700 truncate hover:text-blue-600"
                                                title="点击预览内容"
                                            >
                                                {f.fileName}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteFile(f.id, f.fileName)}
                                                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                                title="删除文件"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 暂时移除未实现的功能：触发器、记忆、变量、数据库 */}
            </div>
        </div>
    );

    // ==================== 渲染 Agent 节点详细面板 ====================
    const renderAgentNodePanel = (node: AgentNode) => (
        <div className="bg-white rounded-xl border-2 border-blue-400 shadow-xl overflow-hidden" style={{ width: NODE_WIDTH + 40 }}>
            {/* 头部 */}
            <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-500 rounded-lg flex items-center justify-center">
                        <Bot size={14} className="text-white" />
                    </div>
                    <span className="font-bold text-gray-800">{node.data.label}</span>
                    <span className="px-2 py-0.5 bg-green-100 text-green-600 text-[10px] rounded-full">正在对话</span>
                </div>
                <button className="text-gray-400 hover:text-gray-600">
                    <MoreHorizontal size={16} />
                </button>
            </div>

            {/* 内容 */}
            <div className="p-4 space-y-4">
                {/* 模型设置 */}
                <div>
                    <button
                        className="w-full flex items-center justify-between text-sm font-medium text-gray-700 mb-2"
                    >
                        <div className="flex items-center gap-1">
                            <ChevronDown size={14} />
                            <span>模型设置</span>
                        </div>
                    </button>
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-purple-500 rounded flex items-center justify-center">
                            <span className="text-white text-[8px] font-bold">D</span>
                        </div>
                        <select
                            value={node.data.modelId || selectedModel}
                            onChange={e => {
                                updateNodeData(node.id, { modelId: e.target.value });
                                setSelectedModel(e.target.value);
                                storage.saveModelName?.(e.target.value);
                            }}
                            disabled={!allowModelSelect}
                            className="flex-1 text-sm bg-transparent border-none outline-none text-gray-700"
                        >
                            {(availableModels?.length ? availableModels : DEFAULT_MODELS).map((m: any) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="text-gray-400" />
                    </div>
                </div>

                {/* 适用场景 */}
                <div>
                    <div className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                        <ChevronDown size={14} />
                        <span>适用场景</span>
                        <span className="text-red-500">*</span>
                        <Info size={12} className="text-gray-400" />
                    </div>
                    <textarea
                        value={node.data.scenario || ''}
                        onChange={e => updateNodeData(node.id, { scenario: e.target.value })}
                        placeholder="分发用户的对话人物。"
                        className="w-full p-2 text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-lg resize-none h-16 focus:border-blue-500 outline-none"
                    />
                </div>

                {/* Agent 提示词 */}
                <div>
                    <div className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                        <ChevronDown size={14} />
                        <span>Agent 提示词</span>
                    </div>
                    <div className="p-2 bg-gray-50 rounded-lg text-xs text-gray-600 max-h-20 overflow-hidden">
                        {node.data.systemPrompt?.substring(0, 150) || personaPrompt.substring(0, 150)}...
                    </div>
                </div>

                {/* 技能 */}
                <div>
                    <div className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
                        <div className="flex items-center gap-1">
                            <ChevronDown size={14} />
                            <span>技能</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Settings size={14} className="text-gray-400" />
                            <button
                                type="button"
                                onClick={() => toggleSection('skills')}
                                className="p-0.5 text-gray-400 hover:text-blue-600"
                                title="在左侧面板配置知识库"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
                            <div className="w-5 h-5 bg-purple-500 rounded flex items-center justify-center">
                                <Database size={10} className="text-white" />
                            </div>
                            <span className="text-xs text-gray-700">知识库文件：{kbFiles.length} 个</span>
                        </div>
                    </div>
                </div>

                {/* 用户问题建议 */}
                <div>
                    <button
                        onClick={() => setShowSuggestions(!showSuggestions)}
                        className="w-full flex items-center justify-between text-sm font-medium text-gray-700"
                    >
                        <div className="flex items-center gap-1">
                            <ChevronRight size={14} />
                            <span>用户问题建议</span>
                        </div>
                        <span className="text-xs text-gray-400">关闭 ▼</span>
                    </button>
                </div>
            </div>

            {/* 输入连接点 */}
            <div
                onClick={(e) => handleInputClick(e, node.id)}
                className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-blue-400 rounded-full flex items-center justify-center cursor-pointer hover:border-blue-600 hover:scale-110 transition-all"
            >
                <div className="w-2 h-2 rounded-full bg-blue-400" />
            </div>

            {/* 输出连接点 */}
            <div
                onClick={(e) => handleOutputClick(e, node.id)}
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-blue-400 rounded-full flex items-center justify-center cursor-pointer hover:border-blue-600 hover:scale-110 transition-all"
            >
                <ChevronRight size={12} className="text-blue-400" />
            </div>
        </div>
    );

    // ==================== 渲染开始节点 ====================
    const renderStartNode = (node: AgentNode) => (
        <div className="bg-white rounded-xl border-2 border-[#7C5CFC] shadow-lg px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-[#7C5CFC] rounded-lg flex items-center justify-center">
                <Play size={16} className="text-white fill-white ml-0.5" />
            </div>
            <span className="font-bold text-gray-800">开始</span>
            <Settings size={14} className="text-gray-400" />
            
            {/* 输出连接点 */}
            <div
                onClick={(e) => handleOutputClick(e, node.id)}
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-[#7C5CFC] rounded-full flex items-center justify-center cursor-pointer hover:border-purple-600 hover:scale-110 transition-all"
            >
                <div className="w-2 h-2 rounded-full bg-[#7C5CFC]" />
            </div>
        </div>
    );

    // ==================== 渲染画布 ====================
    const renderCanvas = () => (
        <div className="flex-1 relative overflow-hidden bg-[#F8FAFC]">
            {/* 网格背景 */}
            <div
                ref={canvasRef}
                className="absolute inset-0 canvas-bg"
                style={{
                    backgroundImage: `
                        radial-gradient(circle, #E2E8F0 1px, transparent 1px)
                    `,
                    backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
                    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
                    cursor: isPanning ? 'grabbing' : 'default'
                }}
                onMouseDown={handleCanvasMouseDown}
            >
                {/* 变换容器 */}
                <div
                    className="absolute"
                    style={{
                        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                        transformOrigin: '0 0'
                    }}
                >
                    {/* 渲染边 */}
                    <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible', width: '5000px', height: '5000px' }}>
                        <defs>
                            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                                <path d="M0,0 L10,5 L0,10 Z" fill="#7C5CFC" />
                            </marker>
                        </defs>
                        {edges.map(edge => {
                            const sourceNode = nodes.find(n => n.id === edge.source);
                            const targetNode = nodes.find(n => n.id === edge.target);
                            if (!sourceNode || !targetNode) return null;

                            const sourceWidth = sourceNode.type === 'start' ? 150 : NODE_WIDTH + 40;
                            const targetWidth = targetNode.type === 'start' ? 150 : NODE_WIDTH + 40;
                            
                            const sx = sourceNode.position.x + sourceWidth;
                            const sy = sourceNode.position.y + (sourceNode.type === 'start' ? 30 : NODE_HEIGHT);
                            const tx = targetNode.position.x;
                            const ty = targetNode.position.y + (targetNode.type === 'start' ? 30 : NODE_HEIGHT);

                            return (
                                <path
                                    key={edge.id}
                                    d={getEdgePath(sx, sy, tx, ty)}
                                    stroke="#7C5CFC"
                                    strokeWidth="2"
                                    fill="none"
                                    markerEnd="url(#arrow)"
                                    className="transition-all"
                                />
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
                                stroke="#7C5CFC"
                                strokeWidth="2"
                                strokeDasharray="5,5"
                                fill="none"
                            />
                        )}
                    </svg>

                    {/* 渲染节点 */}
                    {nodes.map(node => (
                        <div
                            key={node.id}
                            className="absolute select-none cursor-move"
                            style={{ left: node.position.x, top: node.position.y }}
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        >
                            {node.type === 'start' ? renderStartNode(node) : renderAgentNodePanel(node)}
                        </div>
                    ))}
                </div>

                {/* 添加节点按钮 */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
                    <button
                        onClick={() => addNode('agent')}
                        className="flex items-center gap-2 px-4 py-2 bg-[#7C5CFC] text-white rounded-full shadow-lg hover:brightness-110 transition-all"
                    >
                        <span>添加节点</span>
                    </button>
                </div>

                {/* 缩放控制 */}
                <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-white rounded-lg shadow-md border border-gray-200 p-1">
                    <button className="p-1 hover:bg-gray-100 rounded" onClick={() => handleZoom(-0.1)}>
                        <Minus size={16} className="text-gray-600" />
                    </button>
                    <span className="text-sm text-gray-600 w-12 text-center">{Math.round(viewport.zoom * 100)}%</span>
                    <button className="p-1 hover:bg-gray-100 rounded" onClick={() => handleZoom(0.1)}>
                        <Plus size={16} className="text-gray-600" />
                    </button>
                </div>
            </div>
        </div>
    );

    // ==================== 渲染右侧预览面板 ====================
    const renderPreviewPanel = () => (
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden">
            {/* 预览与调试标题 - 固定高度 */}
            <div className="flex-shrink-0 p-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ChevronRight size={16} className="text-gray-400" />
                    <span className="font-bold text-gray-800">预览与调试</span>
                </div>
                {/* 清空对话按钮 */}
                <button
                    onClick={() => setChatMessages([])}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="清空对话，重新测试"
                >
                    清空
                </button>
            </div>

            {/* 聊天消息区 - 可滚动 */}
            <div
                ref={chatContainerRef}
                className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
                onScroll={handleChatScroll}
            >
                {/* 智能体头像和名称 */}
                <div className="flex flex-col items-center py-6">
                    <img
                        src={agent.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=agent'}
                        alt={agentName}
                        className="w-16 h-16 rounded-full border-4 border-white shadow-lg"
                    />
                    <span className="mt-2 font-bold text-gray-800">{agentName}</span>
                </div>

                {/* 欢迎语 - 只在没有消息时显示 */}
                {chatMessages.length === 0 && welcomeMessage && (
                    <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-gray-100 text-gray-800 rounded-bl-sm">
                            <p className="text-sm whitespace-pre-wrap break-words">{welcomeMessage}</p>
                        </div>
                    </div>
                )}

                {/* 消息列表 */}
                {chatMessages.map(msg => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                msg.role === 'user'
                                    ? 'bg-blue-500 text-white rounded-br-sm'
                                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                            }`}
                        >
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                    </div>
                ))}

                {/* 输入提示 */}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-2xl px-4 py-2 rounded-bl-sm">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 跳到最新按钮 - 浮动 */}
            {!isChatPinnedToBottom && chatMessages.length > 0 && (
                <div className="flex-shrink-0 flex justify-center py-2">
                    <button
                        type="button"
                        onClick={() => {
                            scrollChatToBottom();
                            setIsChatPinnedToBottom(true);
                        }}
                        className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-full shadow hover:bg-gray-50"
                    >
                        跳到最新
                    </button>
                </div>
            )}

            {/* 输入框 - 固定在底部 */}
            <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white">
                <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
                    <button className="text-gray-400 hover:text-gray-600">
                        <FileText size={18} />
                    </button>
                    <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !isTyping && chatInput.trim() && sendMessage()}
                        placeholder="发送消息..."
                        className="flex-1 bg-transparent border-none outline-none text-sm text-gray-700 placeholder-gray-400"
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!chatInput.trim() || isTyping}
                        className="text-gray-400 hover:text-blue-500 disabled:opacity-50"
                    >
                        <Send size={18} />
                    </button>
                </div>
                <p className="text-[10px] text-gray-400 text-center mt-2">
                    内容由AI生成，无法确保真实准确，仅供参考。
                </p>
            </div>
        </div>
    );

    // ==================== 主渲染 ====================
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
            {/* 顶部工具栏 */}
            <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <ArrowLeft size={20} className="text-gray-600" />
                    </button>
                    <div className="flex items-center gap-2">
                        <img
                            src={agent.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=agent'}
                            alt=""
                            className="w-8 h-8 rounded-lg"
                        />
                        <input
                            type="text"
                            value={agentName}
                            onChange={e => setAgentName(e.target.value)}
                            className="font-bold text-gray-800 border-none outline-none bg-transparent"
                        />
                        <button className="text-gray-400 hover:text-gray-600">
                            <ChevronDown size={16} />
                        </button>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-500">
                        <Bot size={12} />
                        <span>多 Agents</span>
                        <ChevronDown size={12} />
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* 草稿保存状态 */}
                    <div className="flex items-center gap-2 text-xs">
                        {draftSavedAt && (
                            <span className="text-green-600 bg-green-50 px-2 py-1 rounded">
                                ✓ {formatDraftSaved()}
                            </span>
                        )}
                        {lastSaved && (
                            <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                {formatLastPublished()}
                            </span>
                        )}
                        {!draftSavedAt && !lastSaved && (
                            <span className="text-gray-400">未保存</span>
                        )}
                    </div>
                    {saveError && (
                        <span className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg font-medium max-w-xs truncate" title={saveError}>
                            ⚠️ {saveError}
                        </span>
                    )}
                    <button className="p-2 hover:bg-gray-100 rounded-lg" title="查看历史版本">
                        <Clock size={18} className="text-gray-400" />
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded-lg">
                        <MoreHorizontal size={18} className="text-gray-400" />
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                        <span>发布</span>
                    </button>
                </div>
            </div>

            {/* 主内容区 */}
            <div className="flex-1 flex overflow-hidden">
                {renderLeftPanel()}
                {renderCanvas()}
                {renderPreviewPanel()}
            </div>

            {/* 人设与回复逻辑 - 抽屉编辑（右侧；小屏底部） */}
            {isPersonaDrawerOpen && (
                <div
                    className="fixed inset-0 z-[70] bg-black/40"
                    onMouseDown={closePersonaDrawer}
                    role="dialog"
                    aria-modal="true"
                    aria-label="人设与回复逻辑编辑抽屉"
                >
                    <div
                        className="absolute right-0 top-0 h-full w-full sm:w-[640px] bg-white border-l border-gray-200 shadow-2xl flex flex-col"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-gray-900">人设与回复逻辑</div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                    建议：结构化编写（身份/边界/语气/输出格式），方便维护与复用
                                </div>
                            </div>
                            <button
                                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                                onClick={closePersonaDrawer}
                            >
                                关闭
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-5">
                            <textarea
                                value={personaDraft}
                                onChange={(e) => setPersonaDraft(e.target.value)}
                                placeholder="在这里输入完整的人设与回复逻辑..."
                                className="w-full min-h-[60vh] p-4 text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-gray-50 leading-relaxed"
                            />
                            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                                <span>字符数：{personaDraft.length}</span>
                                <span className="text-gray-400">支持粘贴长文本；保存后会同步到智能体配置与预览</span>
                            </div>
                        </div>

                        <div className="px-5 py-4 border-t border-gray-200 bg-white">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">💡 保存后可直接在右侧预览区测试效果</span>
                                <div className="flex items-center gap-3">
                                    <button
                                        className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                                        onClick={closePersonaDrawer}
                                    >
                                        取消
                                    </button>
                                    <button
                                        className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium"
                                        onClick={savePersonaDrawer}
                                    >
                                        保存并测试
                                    </button>
                                    <button
                                        className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                        onClick={savePersonaAndPublish}
                                    >
                                        保存并发布
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 知识库文件预览（真实内容） */}
            {kbPreview && (
                <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
                    <div className="w-full max-w-3xl bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                                <FileText size={16} className="text-blue-600" />
                                <span className="font-medium text-gray-800 truncate">{kbPreview.fileName}</span>
                            </div>
                            <button
                                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                                onClick={() => setKbPreview(null)}
                            >
                                关闭
                            </button>
                        </div>
                        <div className="p-4 max-h-[70vh] overflow-auto">
                            {kbPreviewLoading ? (
                                <div className="text-sm text-gray-500">加载中...</div>
                            ) : (
                                <pre className="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50 border border-gray-100 rounded-lg p-4">
                                    {kbPreview.content || '（文件无可展示内容）'}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AgentBuilder;

