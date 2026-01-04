
import React, { useState, useEffect } from 'react';
import { User, Language, ProjectContext, UserProfileData, FormField } from '../../types';
import { translations } from '../../utils/translations';
import { X, ArrowLeft, Briefcase, Plus, Edit, ShieldCheck, FileText, Brain } from 'lucide-react';

interface UserEditModalProps {
    user: User;
    onClose: () => void;
    onSave: (user: User) => void;
    language: Language;
    onboardingConfig: FormField[];
}

const UserEditModal: React.FC<UserEditModalProps> = ({ user, onClose, onSave, language, onboardingConfig }) => {
    const [editingUser, setEditingUser] = useState<User>(user);
    const [editingProjectContext, setEditingProjectContext] = useState<{ 
        projectId: string, 
        data: UserProfileData,
        name: string,
        description: string
    } | null>(null);

    const tCommon = translations[language]?.common || translations['en'].common;
    const t = translations[language]?.admin || translations['en'].admin;

    const handleSaveContextData = () => {
        if (!editingUser || !editingProjectContext) return;
        let updatedProjects;
        if (editingProjectContext.projectId === 'new') {
            const newProject: ProjectContext = {
                id: `p-${Date.now()}`,
                name: editingProjectContext.name || 'New Project',
                description: editingProjectContext.description,
                data: editingProjectContext.data,
                updatedAt: Date.now()
            };
            updatedProjects = [newProject, ...(editingUser.projects || [])];
        } else {
            updatedProjects = editingUser.projects.map(p => 
                p.id === editingProjectContext.projectId 
                    ? { ...p, name: editingProjectContext.name, description: editingProjectContext.description, data: editingProjectContext.data, updatedAt: Date.now() }
                    : p
            );
        }
        setEditingUser({ ...editingUser, projects: updatedProjects });
        setEditingProjectContext(null); 
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface border border-border rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-border flex justify-between items-center bg-surface">
                    <div className="flex items-center gap-2">
                        {editingProjectContext && (
                            <button onClick={() => setEditingProjectContext(null)} className="p-1 hover:bg-background rounded-full text-textSecondary">
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        <h3 className="text-xl font-bold text-textMain">
                            {editingProjectContext 
                                ? (editingProjectContext.projectId === 'new' ? t.userModal.createContext : t.userModal.editContext)
                                : t.userModal.title}
                        </h3>
                    </div>
                    <button onClick={onClose}><X size={24} className="text-textSecondary hover:text-textMain"/></button>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    {!editingProjectContext && (
                        <>
                            <div className="space-y-4">
                                <h4 className="font-bold text-primary text-sm uppercase tracking-wide border-b border-border pb-2">{t.userModal.accountInfo}</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-textSecondary uppercase">{t.userModal.name}</label>
                                        <input type="text" value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-textSecondary uppercase">{t.userModal.email}</label>
                                        <input type="email" value={editingUser.email} onChange={e => setEditingUser({...editingUser, email: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-textSecondary uppercase">{t.userModal.credits}</label>
                                        <input type="number" value={editingUser.credits} onChange={e => setEditingUser({...editingUser, credits: parseFloat(e.target.value)})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-textSecondary uppercase">{t.userModal.status}</label>
                                        <select value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value as any})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none">
                                            <option value="active">{t.status.active}</option>
                                            <option value="suspended">{t.status.suspended}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* NEW: Global Preferences Section */}
                            <div className="space-y-4">
                                <h4 className="font-bold text-primary text-sm uppercase tracking-wide border-b border-border pb-2 flex items-center gap-2">
                                    <Brain size={14}/> {language === 'zh' ? '全局记忆 / 偏好' : 'Global Memory / Preferences'}
                                </h4>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-textSecondary uppercase">
                                        {language === 'zh' ? '用户偏好指令 (所有智能体可见)' : 'User Instructions (Visible to ALL Agents)'}
                                    </label>
                                    <textarea 
                                        value={editingUser.preferences || ''}
                                        onChange={e => setEditingUser({...editingUser, preferences: e.target.value})}
                                        className="w-full bg-background border border-border rounded-lg px-4 py-3 text-textMain focus:border-primary outline-none h-24 resize-none shadow-sm font-mono text-xs leading-relaxed"
                                        placeholder={language === 'zh' ? '例如：我不喜欢使用感叹号。回复要简短有力。' : 'e.g., I dislike exclamation marks. Prefer concise answers.'}
                                    />
                                    <p className="text-[10px] text-textSecondary">
                                        {language === 'zh' 
                                            ? '此内容将作为“系统级指令”注入到每一次对话中，实现跨会话记忆效果。' 
                                            : 'This content is injected as "System Instructions" into every chat, creating a long-term memory effect.'}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center border-b border-border pb-2">
                                    <h4 className="font-bold text-primary text-sm uppercase tracking-wide flex items-center gap-2">
                                        <Briefcase size={14}/> {t.userModal.projectContexts}
                                    </h4>
                                    <button 
                                        onClick={() => setEditingProjectContext({ projectId: 'new', data: {}, name: '', description: '' })}
                                        className="text-xs flex items-center gap-1 bg-primary/10 hover:bg-primary text-primary hover:text-white border border-primary/20 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        <Plus size={12}/> {t.userModal.addContext}
                                    </button>
                                </div>
                                {!editingUser.projects || editingUser.projects.length === 0 ? (
                                    <div className="text-center py-4 text-xs text-textSecondary italic border border-dashed border-border rounded-lg">
                                        {t.userModal.noContexts}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {editingUser.projects.map((proj) => (
                                            <div key={proj.id} className="bg-background border border-border rounded-xl p-4 flex flex-col gap-3">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="font-bold text-textMain text-sm">{proj.name}</div>
                                                        <div className="text-xs text-textSecondary">{proj.description}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {proj.id === editingUser.activeProjectId && (
                                                            <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded border border-green-500/20">Active</span>
                                                        )}
                                                        <button 
                                                            onClick={() => setEditingProjectContext({ projectId: proj.id, data: proj.data, name: proj.name, description: proj.description || '' })}
                                                            className="text-xs flex items-center gap-1 bg-surface hover:bg-primary hover:text-white border border-border px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            <Edit size={12} /> {t.userModal.editContext}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="bg-surface/50 rounded-lg p-2 text-xs font-mono text-textSecondary space-y-1 overflow-x-auto border border-border/50">
                                                    {Object.entries(proj.data).slice(0, 3).map(([key, val]) => {
                                                        if(key.startsWith('_content_')) return null; 
                                                        return (
                                                            <div key={key} className="flex gap-2">
                                                                <span className="text-primary">{key}:</span>
                                                                <span className="truncate">{String(val).substring(0, 50)}...</span>
                                                            </div>
                                                        )
                                                    })}
                                                    {Object.keys(proj.data).filter(k => k.startsWith('_content_')).map(k => (
                                                        <div key={k} className="flex gap-2">
                                                            <span className="text-accent">Files ({k.replace('_content_', '')}):</span>
                                                            <span>{Object.keys(proj.data[k] as any).length} {t.userModal.filesLoaded}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    {editingProjectContext && (
                        <div className="space-y-6">
                            <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg text-sm text-primary mb-4 flex items-start gap-2">
                                <ShieldCheck size={16} className="mt-0.5"/>
                                <div>{t.userModal.overrideWarning}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-border">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-textSecondary uppercase block">{t.userModal.contextName}</label>
                                    <input 
                                        type="text"
                                        value={editingProjectContext.name}
                                        onChange={(e) => setEditingProjectContext({...editingProjectContext, name: e.target.value})}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-textSecondary uppercase block">{t.userModal.contextDesc}</label>
                                    <input 
                                        type="text"
                                        value={editingProjectContext.description}
                                        onChange={(e) => setEditingProjectContext({...editingProjectContext, description: e.target.value})}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                    />
                                </div>
                            </div>
                            {onboardingConfig.map(field => (
                                <div key={field.id} className="space-y-1">
                                    <label className="text-xs font-bold text-textSecondary uppercase block">{field.label} ({field.key})</label>
                                    {field.type === 'textarea' ? (
                                        <textarea 
                                            value={editingProjectContext.data[field.key] as string || ''}
                                            onChange={(e) => setEditingProjectContext({...editingProjectContext, data: {...editingProjectContext.data, [field.key]: e.target.value}})}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none h-24"
                                        />
                                    ) : field.type === 'file' ? (
                                        <div className="p-3 bg-background border border-border rounded-lg">
                                            <div className="text-xs text-textSecondary mb-2">Attached Files (File content is stored internally):</div>
                                            <div className="flex gap-2 flex-wrap">
                                                {((editingProjectContext.data[field.key] as string[]) || []).map((fname: string, i: number) => (
                                                    <span key={i} className="px-2 py-1 bg-surface border border-border rounded text-xs text-textMain flex items-center gap-2">
                                                        <FileText size={12}/> {fname}
                                                    </span>
                                                ))}
                                                {(!editingProjectContext.data[field.key] || (editingProjectContext.data[field.key] as string[]).length === 0) && (
                                                    <span className="text-xs text-textSecondary italic">No files uploaded.</span>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <input 
                                            type={field.type} 
                                            value={editingProjectContext.data[field.key] as string || ''}
                                            onChange={(e) => setEditingProjectContext({...editingProjectContext, data: {...editingProjectContext.data, [field.key]: e.target.value}})}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                        />
                                    )}
                                </div>
                            ))}
                            <div className="pt-4 border-t border-border">
                                <h5 className="text-xs font-bold text-textSecondary uppercase mb-3">{t.userModal.customData}</h5>
                                {Object.keys(editingProjectContext.data).filter(k => !onboardingConfig.find(f => f.key === k) && !k.startsWith('_content_')).map(key => (
                                    <div key={key} className="flex gap-2 mb-2">
                                        <div className="w-1/3 bg-surface border border-border rounded px-2 py-1.5 text-xs text-textSecondary font-mono">{key}</div>
                                        <input 
                                            type="text" 
                                            value={editingProjectContext.data[key] as string} 
                                            onChange={(e) => setEditingProjectContext({...editingProjectContext, data: {...editingProjectContext.data, [key]: e.target.value}})}
                                            className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs text-textMain focus:border-primary outline-none"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-border bg-surface flex justify-end gap-2">
                    {editingProjectContext ? (
                        <>
                            <button onClick={() => setEditingProjectContext(null)} className="px-4 py-2 text-textSecondary hover:bg-background rounded-lg text-sm">{tCommon.cancel}</button>
                            <button onClick={handleSaveContextData} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110">
                                {editingProjectContext.projectId === 'new' ? t.userModal.createContext : t.userModal.updateContext}
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={onClose} className="px-4 py-2 text-textSecondary hover:bg-surface rounded-lg text-sm">{tCommon.cancel}</button>
                            <button onClick={() => onSave(editingUser)} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110">{tCommon.save}</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserEditModal;
