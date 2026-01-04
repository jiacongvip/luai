
import React, { useState } from 'react';
import { Agent, Language } from '../../types';
import { translations } from '../../utils/translations';
import { generateSystemPrompt } from '../../services/geminiService';
import { getAllTemplates, getPromptTemplate, PromptTemplate } from '../../utils/promptTemplates';
import { X, Sparkles, Loader2, Zap, FileText, Upload, Plus, BookOpen } from 'lucide-react';

interface AgentEditModalProps {
    agent: Agent;
    onClose: () => void;
    onSave: (agent: Agent) => void;
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

    const handleSave = () => {
        let finalData = { ...formData };
        
        // Auto-add style if input is not empty but user forgot to click +
        if (newStyle.trim()) {
            finalData = {
                ...finalData,
                styles: [...(finalData.styles || []), newStyle.trim()]
            };
        }
        
        onSave(finalData);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface border border-border rounded-xl w-full max-w-4xl shadow-2xl flex flex-col h-[90vh]">
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
                            
                            <h4 className="font-bold text-primary border-b border-border pb-2 pt-4">{t.agentModal.knowledge}</h4>
                            <div className="space-y-2">
                                <p className="text-[10px] text-textSecondary">{t.agentModal.kbDesc}</p>
                                <div className="flex gap-2 flex-wrap">
                                    {formData.knowledgeFiles?.map((f, i) => (
                                        <span key={i} className="px-2 py-1 bg-surface border border-border rounded text-xs text-textMain flex items-center gap-2">
                                            <FileText size={12}/> {f}
                                            <button onClick={() => setFormData({...formData, knowledgeFiles: formData.knowledgeFiles?.filter(file => file !== f)})} className="hover:text-red-500"><X size={12}/></button>
                                        </span>
                                    ))}
                                    <button className="px-2 py-1 bg-primary/10 border border-primary/20 text-primary rounded text-xs flex items-center gap-1 hover:bg-primary/20 transition-colors">
                                        <Upload size={12}/> {t.agentModal.uploadBtn}
                                    </button>
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
        </div>
    );
};

export default AgentEditModal;
