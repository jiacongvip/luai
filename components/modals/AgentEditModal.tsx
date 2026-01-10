
import React, { useState, useRef } from 'react';
import { Agent, Language } from '../../types';
import { translations } from '../../utils/translations';
import { generateSystemPrompt } from '../../services/geminiService';
import { getAllTemplates, PromptTemplate } from '../../utils/promptTemplates';
import { X, Sparkles, Loader2, Zap, FileText, Upload, Plus, BookOpen, Eye, Edit3, Trash2, Save, Download, GitBranch, Layers } from 'lucide-react';
import AgentWorkflowEditor from './AgentWorkflowEditor';
import AgentBuilder from '../../views/AgentBuilder';

interface KnowledgeFile {
    name: string;
    content: string;
    type: string;
    size: number;
}

interface AgentEditModalProps {
    agent: Agent;
    onClose: () => void;
    onSave: (agent: Agent) => void | Promise<void>;
    language: Language;
    availableCategories: string[];
}

const AgentEditModal: React.FC<AgentEditModalProps> = ({ agent, onClose, onSave, language, availableCategories }) => {
    const [formData, setFormData] = useState<Agent>(agent);
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
    const [promptBrief, setPromptBrief] = useState('');
    const [showAIPromptInput, setShowAIPromptInput] = useState(false);
    const [showTemplateSelector, setShowTemplateSelector] = useState(false);
    const [newStyle, setNewStyle] = useState('');
    const [showWorkflowEditor, setShowWorkflowEditor] = useState(false);
    const [showAgentBuilder, setShowAgentBuilder] = useState(false);
    
    // 知识库相关状态
    const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>(() => {
        // 从 agent 的 knowledgeFiles 初始化（如果有的话）
        return (agent.knowledgeFiles || []).map(name => ({
            name,
            content: '',
            type: 'text/plain',
            size: 0
        }));
    });
    const [selectedFile, setSelectedFile] = useState<KnowledgeFile | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const tCommon = translations[language]?.common || translations['en'].common;
    const t = translations[language]?.admin || translations['en'].admin;

    const handleAISystemPrompt = async () => {
        if (!promptBrief.trim()) return;
        setIsGeneratingPrompt(true);
        try {
            const generated = await generateSystemPrompt(promptBrief, language);
            if (generated) {
                setFormData(prev => ({ ...prev, systemPrompt: generated }));
                setShowAIPromptInput(false);
                setPromptBrief('');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsGeneratingPrompt(false);
        }
    };

    const handleAddStyle = () => {
        if (newStyle.trim()) {
            setFormData(prev => ({
                ...prev,
                styles: [...(prev.styles || []), newStyle.trim()]
            }));
            setNewStyle('');
        }
    };

    const handleRemoveStyle = (styleToRemove: string) => {
        setFormData(prev => ({
            ...prev,
            styles: prev.styles?.filter(s => s !== styleToRemove)
        }));
    };

    const handleSelectTemplate = (template: PromptTemplate) => {
        setFormData(prev => ({
            ...prev,
            systemPrompt: template.systemPrompt,
            name: prev.name || (language === 'zh' ? template.nameZh : template.name),
            description: prev.description || (language === 'zh' ? template.descriptionZh : template.description),
            description_zh: prev.description_zh || template.descriptionZh,
            category: prev.category || template.category,
        }));
        setShowTemplateSelector(false);
    };

    // 知识库文件上传
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const newFiles: KnowledgeFile[] = [];
        
        for (const file of Array.from(files)) {
            // 检查文件大小（最大 5MB）
            if (file.size > 5 * 1024 * 1024) {
                alert(language === 'zh' ? `文件 ${file.name} 太大，最大支持 5MB` : `File ${file.name} is too large. Maximum size is 5MB`);
                continue;
            }

            // 读取文件内容
            const content = await readFileAsText(file);
            
            newFiles.push({
                name: file.name,
                content,
                type: file.type || 'text/plain',
                size: file.size
            });
        }

        setKnowledgeFiles(prev => [...prev, ...newFiles]);
        
        // 重置 input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const readFileAsText = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            
            // 根据文件类型选择读取方式
            if (file.type.startsWith('text/') || 
                file.name.endsWith('.json') || 
                file.name.endsWith('.md') || 
                file.name.endsWith('.txt') ||
                file.name.endsWith('.csv') ||
                file.name.endsWith('.xml') ||
                file.name.endsWith('.yaml') ||
                file.name.endsWith('.yml')) {
                reader.readAsText(file);
            } else {
                // 对于二进制文件，读取为 Base64
                reader.readAsDataURL(file);
            }
        });
    };

    // 预览文件
    const handlePreview = (file: KnowledgeFile) => {
        setSelectedFile(file);
        setShowPreview(true);
        setIsEditing(false);
    };

    // 编辑文件
    const handleEdit = (file: KnowledgeFile) => {
        setSelectedFile(file);
        setEditContent(file.content);
        setIsEditing(true);
        setShowPreview(true);
    };

    // 保存编辑
    const handleSaveEdit = () => {
        if (selectedFile) {
            setKnowledgeFiles(prev => prev.map(f => 
                f.name === selectedFile.name 
                    ? { ...f, content: editContent, size: new Blob([editContent]).size }
                    : f
            ));
            setSelectedFile({ ...selectedFile, content: editContent });
            setIsEditing(false);
        }
    };

    // 删除文件
    const handleDeleteFile = (fileName: string) => {
        if (confirm(language === 'zh' ? `确定要删除 ${fileName} 吗？` : `Are you sure you want to delete ${fileName}?`)) {
            setKnowledgeFiles(prev => prev.filter(f => f.name !== fileName));
            if (selectedFile?.name === fileName) {
                setSelectedFile(null);
                setShowPreview(false);
            }
        }
    };

    // 下载文件
    const handleDownload = (file: KnowledgeFile) => {
        const blob = new Blob([file.content], { type: file.type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // 格式化文件大小
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // 获取文件图标颜色
    const getFileColor = (fileName: string): string => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'json': return 'text-yellow-500';
            case 'md': return 'text-blue-500';
            case 'txt': return 'text-gray-500';
            case 'csv': return 'text-green-500';
            case 'xml': case 'yaml': case 'yml': return 'text-orange-500';
            default: return 'text-primary';
        }
    };

    const handleSave = () => {
        let finalData = { ...formData };
        
        // Auto-add style if input is not empty but user forgot to click +
        if (newStyle.trim()) {
            finalData = {
                ...finalData,
                styles: [...(finalData.styles || []), newStyle.trim()]
            };
        }
        
        // 更新知识库文件列表
        finalData.knowledgeFiles = knowledgeFiles.map(f => f.name);
        
        // TODO: 这里应该调用 API 上传文件内容到后端
        // 目前只是保存文件名列表
        
        onSave(finalData);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface border border-border rounded-xl w-full max-w-5xl shadow-2xl flex flex-col h-[90vh]">
                <div className="p-5 border-b border-border flex justify-between items-center bg-background/50">
                    <h3 className="text-xl font-bold text-textMain">{t.agentModal.title}</h3>
                    <button onClick={onClose}><X size={24} className="text-textSecondary hover:text-textMain"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <h4 className="font-bold text-primary border-b border-border pb-2">{t.agentModal.basicInfo}</h4>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">{t.agentModal.name}</label>
                                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">{t.agentModal.role}</label>
                                <input type="text" value={language === 'zh' ? (formData.role_zh || formData.role) : formData.role} onChange={e => setFormData({...formData, role: e.target.value, role_zh: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">Avatar URL</label>
                                <div className="flex gap-2">
                                    <img src={formData.avatar} className="w-10 h-10 rounded-lg bg-black/20" alt=""/>
                                    <input type="text" value={formData.avatar} onChange={e => setFormData({...formData, avatar: e.target.value})} className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-textSecondary uppercase">{t.agentModal.price}</label>
                                    <input type="number" value={formData.pricePerMessage} onChange={e => setFormData({...formData, pricePerMessage: parseFloat(e.target.value)})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-textSecondary uppercase">{t.agentModal.category}</label>
                                    <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none">
                                        {availableCategories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                             <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">Description</label>
                                <textarea value={language === 'zh' ? (formData.description_zh || formData.description) : formData.description} onChange={e => setFormData({...formData, description: e.target.value, description_zh: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none h-24 resize-none" />
                            </div>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="flex items-center justify-between border-b border-border pb-2">
                                <h4 className="font-bold text-primary">{t.agentModal.logic}</h4>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setShowAgentBuilder(true)}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] font-bold text-blue-500 hover:bg-blue-500 hover:text-white transition-all shadow-sm"
                                    >
                                        <Layers size={12}/> {language === 'zh' ? '可视化编排' : 'Visual Builder'}
                                    </button>
                                    <button 
                                        onClick={() => setShowWorkflowEditor(true)}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-bold text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                                    >
                                        <GitBranch size={12}/> {language === 'zh' ? '工作流' : 'Workflow'}
                                    </button>
                                    <button 
                                        onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] font-bold text-blue-500 hover:bg-blue-500 hover:text-white transition-all shadow-sm"
                                    >
                                        <BookOpen size={12}/> {language === 'zh' ? '模板库' : 'Templates'}
                                    </button>
                                <button 
                                    onClick={() => setShowAIPromptInput(!showAIPromptInput)}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-accent/10 border border-accent/20 rounded-lg text-[10px] font-bold text-accent hover:bg-accent hover:text-white transition-all shadow-sm"
                                >
                                    <Sparkles size={12}/> AI Assist
                                </button>
                            </div>
                            </div>

                            {showTemplateSelector && (
                                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-3 animate-fade-in shadow-inner">
                                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                                        {language === 'zh' ? '提示词模板库' : 'Prompt Template Library'}
                                    </p>
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                        {getAllTemplates().map(template => (
                                            <button
                                                key={template.id}
                                                onClick={() => handleSelectTemplate(template)}
                                                className="w-full text-left p-3 bg-background border border-border rounded-lg hover:border-blue-500 hover:bg-blue-500/5 transition-all"
                                            >
                                                <div className="font-bold text-sm text-textMain">
                                                    {language === 'zh' ? template.nameZh : template.name}
                                                </div>
                                                <div className="text-xs text-textSecondary mt-1">
                                                    {language === 'zh' ? template.descriptionZh : template.description}
                                                </div>
                                                <div className="text-[10px] text-blue-500 mt-1">
                                                    {language === 'zh' ? '点击应用此模板' : 'Click to apply'}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <button 
                                        onClick={() => setShowTemplateSelector(false)} 
                                        className="w-full px-3 py-1 text-[10px] font-bold text-textSecondary hover:bg-background rounded"
                                    >
                                        {language === 'zh' ? '取消' : 'Cancel'}
                                    </button>
                                </div>
                            )}

                            {showAIPromptInput && (
                                <div className="p-4 bg-accent/5 border border-accent/20 rounded-xl space-y-3 animate-fade-in shadow-inner">
                                    <p className="text-[10px] font-bold text-accent uppercase tracking-widest">AI Prompt Generator</p>
                                    <input 
                                        type="text" 
                                        placeholder={language === 'zh' ? '描述一下你想让这个智能体做什么...' : 'Describe the agent...'}
                                        value={promptBrief}
                                        onChange={(e) => setPromptBrief(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-bold text-textMain focus:border-accent outline-none"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setShowAIPromptInput(false)} className="px-3 py-1 text-[10px] font-bold text-textSecondary hover:bg-background rounded">Cancel</button>
                                        <button 
                                            disabled={isGeneratingPrompt || !promptBrief.trim()}
                                            onClick={handleAISystemPrompt}
                                            className="px-4 py-1.5 bg-accent text-white rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 disabled:opacity-50 hover:brightness-110"
                                        >
                                            {isGeneratingPrompt ? <Loader2 size={12} className="animate-spin"/> : <Zap size={12}/>}
                                            {language === 'zh' ? '生成提示词' : 'Generate'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">{t.agentModal.promptLabel}</label>
                                <p className="text-[10px] text-textSecondary">{t.agentModal.promptDesc}</p>
                                <textarea value={formData.systemPrompt} onChange={e => setFormData({...formData, systemPrompt: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-3 text-textMain focus:border-primary outline-none h-48 font-mono text-xs leading-relaxed resize-none shadow-inner" />
                            </div>

                            {/* --- STYLES / PRESETS SECTION --- */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-textSecondary uppercase">{t.agentModal.stylesLabel || 'Styles / Presets (Optional)'}</label>
                                <p className="text-[10px] text-textSecondary">{t.agentModal.stylesDesc || 'Add predefined styles.'}</p>
                                <div className="flex gap-2 mb-2">
                                    <input 
                                        type="text" 
                                        value={newStyle}
                                        onChange={e => setNewStyle(e.target.value)}
                                        placeholder={t.agentModal.addStylePlaceholder || 'Add style...'}
                                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-textMain focus:border-primary outline-none"
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddStyle())}
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleAddStyle}
                                        className="px-3 py-2 bg-background border border-border hover:border-primary text-primary rounded-lg"
                                    >
                                        <Plus size={14}/>
                                    </button>
                                </div>
                                <div className="flex gap-2 flex-wrap min-h-[40px] p-2 bg-background/50 border border-border rounded-lg">
                                    {formData.styles?.map((style, i) => (
                                        <span key={i} className="px-2 py-1 bg-primary/10 border border-primary/20 rounded text-xs text-primary font-bold flex items-center gap-1">
                                            {style}
                                            <button onClick={() => handleRemoveStyle(style)} className="hover:text-red-500 ml-1"><X size={10}/></button>
                                        </span>
                                    ))}
                                    {(!formData.styles || formData.styles.length === 0) && (
                                        <span className="text-xs text-textSecondary italic">{t.agentModal.noStyles || 'No styles defined.'}</span>
                                    )}
                                </div>
                            </div>
                            
                            {/* --- KNOWLEDGE BASE SECTION --- */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between border-b border-border pb-2 pt-4">
                                    <h4 className="font-bold text-primary">{t.agentModal.knowledge}</h4>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        multiple
                                        accept=".txt,.md,.json,.csv,.xml,.yaml,.yml"
                                        className="hidden"
                                    />
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary rounded-lg text-xs font-bold hover:bg-primary hover:text-white transition-all"
                                    >
                                        <Upload size={14}/> {language === 'zh' ? '上传文件' : 'Upload'}
                                    </button>
                                </div>
                                
                                <p className="text-[10px] text-textSecondary">
                                    {language === 'zh' 
                                        ? '支持 .txt, .md, .json, .csv, .xml, .yaml 格式，单个文件最大 5MB' 
                                        : 'Supports .txt, .md, .json, .csv, .xml, .yaml files, max 5MB each'}
                                </p>
                                
                                {/* 文件列表 */}
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {knowledgeFiles.length === 0 ? (
                                        <div className="text-center py-6 bg-background/50 border border-dashed border-border rounded-lg">
                                            <FileText size={24} className="mx-auto text-textSecondary mb-2 opacity-50"/>
                                            <p className="text-xs text-textSecondary">
                                                {language === 'zh' ? '暂无知识库文件' : 'No knowledge files yet'}
                                            </p>
                                            <p className="text-[10px] text-textSecondary mt-1">
                                                {language === 'zh' ? '点击上方按钮上传文件' : 'Click the button above to upload'}
                                            </p>
                                        </div>
                                    ) : (
                                        knowledgeFiles.map((file, i) => (
                                            <div 
                                                key={i} 
                                                className="flex items-center justify-between p-3 bg-background border border-border rounded-lg hover:border-primary/50 transition-colors group"
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <FileText size={18} className={getFileColor(file.name)}/>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-textMain font-medium truncate">{file.name}</p>
                                                        <p className="text-[10px] text-textSecondary">
                                                            {formatFileSize(file.size)} • {file.type || 'text/plain'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => handlePreview(file)}
                                                        className="p-1.5 hover:bg-blue-500/10 text-blue-500 rounded-lg transition-colors"
                                                        title={language === 'zh' ? '预览' : 'Preview'}
                                                    >
                                                        <Eye size={14}/>
                                                    </button>
                                                    <button 
                                                        onClick={() => handleEdit(file)}
                                                        className="p-1.5 hover:bg-green-500/10 text-green-500 rounded-lg transition-colors"
                                                        title={language === 'zh' ? '编辑' : 'Edit'}
                                                    >
                                                        <Edit3 size={14}/>
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDownload(file)}
                                                        className="p-1.5 hover:bg-purple-500/10 text-purple-500 rounded-lg transition-colors"
                                                        title={language === 'zh' ? '下载' : 'Download'}
                                                    >
                                                        <Download size={14}/>
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteFile(file.name)}
                                                        className="p-1.5 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                                                        title={language === 'zh' ? '删除' : 'Delete'}
                                                    >
                                                        <Trash2 size={14}/>
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-border bg-background/50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-textSecondary hover:bg-surface rounded-lg text-sm">{tCommon.cancel}</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110">{tCommon.save}</button>
                </div>
            </div>

            {/* 文件预览/编辑模态框 */}
            {showPreview && selectedFile && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-surface border border-border rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-border flex justify-between items-center bg-background/50">
                            <div className="flex items-center gap-3">
                                <FileText size={20} className={getFileColor(selectedFile.name)}/>
                                <div>
                                    <h4 className="font-bold text-textMain">{selectedFile.name}</h4>
                                    <p className="text-[10px] text-textSecondary">
                                        {formatFileSize(selectedFile.size)} • {isEditing ? (language === 'zh' ? '编辑模式' : 'Edit Mode') : (language === 'zh' ? '预览模式' : 'Preview Mode')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {!isEditing && (
                                    <button 
                                        onClick={() => handleEdit(selectedFile)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-500 rounded-lg text-xs font-bold hover:bg-green-500 hover:text-white transition-all"
                                    >
                                        <Edit3 size={12}/> {language === 'zh' ? '编辑' : 'Edit'}
                                    </button>
                                )}
                                {isEditing && (
                                    <button 
                                        onClick={handleSaveEdit}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:brightness-110 transition-all"
                                    >
                                        <Save size={12}/> {language === 'zh' ? '保存' : 'Save'}
                                    </button>
                                )}
                                <button onClick={() => { setShowPreview(false); setIsEditing(false); }}>
                                    <X size={20} className="text-textSecondary hover:text-textMain"/>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            {isEditing ? (
                                <textarea
                                    value={editContent}
                                    onChange={e => setEditContent(e.target.value)}
                                    className="w-full h-full min-h-[400px] bg-background border border-border rounded-lg p-4 font-mono text-sm text-textMain focus:border-primary outline-none resize-none"
                                    spellCheck={false}
                                />
                            ) : (
                                <pre className="w-full h-full min-h-[400px] bg-background border border-border rounded-lg p-4 font-mono text-sm text-textMain overflow-auto whitespace-pre-wrap break-words">
                                    {selectedFile.content || (language === 'zh' ? '（文件内容为空或无法显示）' : '(File content is empty or cannot be displayed)')}
                                </pre>
                            )}
                        </div>
                        <div className="p-3 border-t border-border bg-background/50 flex justify-between items-center">
                            <p className="text-[10px] text-textSecondary">
                                {isEditing 
                                    ? (language === 'zh' ? '编辑完成后点击保存按钮' : 'Click Save when done editing')
                                    : (language === 'zh' ? '点击编辑按钮修改内容' : 'Click Edit to modify content')
                                }
                            </p>
                            <button 
                                onClick={() => { setShowPreview(false); setIsEditing(false); }}
                                className="px-4 py-1.5 text-textSecondary hover:bg-surface rounded-lg text-sm"
                            >
                                {language === 'zh' ? '关闭' : 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 工作流编辑器 */}
            {showWorkflowEditor && (
                <AgentWorkflowEditor
                    agent={formData}
                    language={language}
                    onClose={() => setShowWorkflowEditor(false)}
                    onSave={(updatedAgent, workflow) => {
                        setFormData(updatedAgent);
                        setShowWorkflowEditor(false);
                        // TODO: 保存工作流数据到后端
                        console.log('Workflow saved:', workflow);
                    }}
                />
            )}

            {/* 新版可视化编排器（类似扣子） */}
            {showAgentBuilder && (
                <AgentBuilder
                    agent={formData}
                    language={language}
                    onClose={() => setShowAgentBuilder(false)}
                    onSave={async (updatedAgent) => {
                        setFormData(updatedAgent);
                        // 等待保存完成再关闭（失败时会抛出异常，由 AgentBuilder 捕获并显示错误）
                        await onSave(updatedAgent);
                        setShowAgentBuilder(false);
                    }}
                />
            )}
        </div>
    );
};

export default AgentEditModal;
