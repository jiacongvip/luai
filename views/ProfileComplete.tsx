
import React, { useState, useEffect } from 'react';
import { User, FormField, UserProfileData, Language, ProjectContext } from '../types';
import { translations } from '../utils/translations';
import { CheckCircle, ArrowRight, User as UserIcon, SkipForward, AlertCircle, Upload, FileText, X, ArrowLeft, ShieldCheck, Plus, Briefcase, ChevronRight, Check, Loader2 } from 'lucide-react';

interface ProfileCompleteProps {
  user: User;
  formConfig: FormField[];
  onComplete: (data: UserProfileData) => void; // Legacy, kept for compatibility if needed
  onCancel?: () => void;
  language: Language;
  onUpdateProjects: (projects: ProjectContext[], activeId: string) => void;
}

const ProfileComplete: React.FC<ProfileCompleteProps> = ({ user, formConfig, onComplete, onCancel, language, onUpdateProjects }) => {
  const t = translations[language].onboarding;
  const tCommon = translations[language].common;
  
  // State
  const [projects, setProjects] = useState<ProjectContext[]>(user.projects || []);
  const [activeProjectId, setActiveProjectId] = useState<string>(user.activeProjectId || (user.projects && user.projects.length > 0 ? user.projects[0].id : ''));
  const [editingProjectId, setEditingProjectId] = useState<string | 'new' | null>(user.projects && user.projects.length > 0 ? user.projects[0].id : 'new');
  
  // Form State
  const [formData, setFormData] = useState<UserProfileData>({});
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);

  // Initialize form when switching editing project
  useEffect(() => {
      if (editingProjectId === 'new') {
          setFormData({});
          setProjectName('');
          setProjectDesc('');
      } else if (editingProjectId) {
          const project = projects.find(p => p.id === editingProjectId);
          if (project) {
              setFormData(project.data);
              setProjectName(project.name);
              setProjectDesc(project.description || '');
          }
      }
  }, [editingProjectId, projects]);

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
        setError(language === 'zh' ? '请输入项目名称' : 'Please enter a project name');
        return;
    }

    const newProject: ProjectContext = {
        id: editingProjectId === 'new' ? Date.now().toString() : editingProjectId!,
        name: projectName,
        description: projectDesc,
        data: formData,
        updatedAt: Date.now()
    };

    let updatedProjects;
    if (editingProjectId === 'new') {
        updatedProjects = [newProject, ...projects];
        setActiveProjectId(newProject.id); // Auto-activate new project
    } else {
        updatedProjects = projects.map(p => p.id === editingProjectId ? newProject : p);
    }

    setProjects(updatedProjects);
    onUpdateProjects(updatedProjects, activeProjectId || newProject.id); // Sync with App
    setEditingProjectId(newProject.id);
    setError(null);
  };

  const handleDeleteProject = (id: string) => {
      if (confirm('Delete this project context?')) {
          const updated = projects.filter(p => p.id !== id);
          setProjects(updated);
          if (activeProjectId === id) {
              setActiveProjectId(updated.length > 0 ? updated[0].id : '');
          }
          if (editingProjectId === id) {
              setEditingProjectId(updated.length > 0 ? updated[0].id : 'new');
          }
          onUpdateProjects(updated, activeProjectId === id ? (updated.length > 0 ? updated[0].id : '') : activeProjectId);
      }
  };

  const handleActivateProject = (id: string) => {
      setActiveProjectId(id);
      onUpdateProjects(projects, id);
  };

  // --- Field Handlers ---
  const handleChange = (key: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleFileChange = async (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          setIsReadingFile(true);
          const newFiles: File[] = Array.from(e.target.files);
          const fileNames = newFiles.map(f => f.name);
          const existingNames = (formData[key] as string[]) || [];
          
          // Helper to read file content
          const readFileContent = (file: File): Promise<string> => {
              return new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = (event) => resolve(event.target?.result as string);
                  reader.onerror = (error) => reject(error);
                  reader.readAsText(file);
              });
          };

          try {
              // Read text content of files (limit to 50kb per file to save LocalStorage)
              const contentMap: Record<string, string> = {};
              for (const file of newFiles) {
                  // Only read text-based files
                  if (file.type.startsWith('text/') || file.name.endsWith('.json') || file.name.endsWith('.md') || file.name.endsWith('.js') || file.name.endsWith('.ts')) {
                      let text = await readFileContent(file);
                      if (text.length > 50000) text = text.substring(0, 50000) + '...[TRUNCATED]';
                      contentMap[file.name] = text;
                  } else {
                      contentMap[file.name] = '[Binary or Non-Text File - Content Not Read]';
                  }
              }

              // Update Form Data: 
              // 1. Store filenames in the main key
              // 2. Store content in a hidden key prefixed with '_content_'
              setFormData(prev => {
                  const contentKey = `_content_${key}`;
                  const prevContent = (prev[contentKey] as unknown as Record<string, string>) || {};
                  return {
                      ...prev,
                      [key]: [...existingNames, ...fileNames],
                      [contentKey]: { ...prevContent, ...contentMap }
                  };
              });

          } catch (err) {
              console.error("Error reading files", err);
              setError("Failed to read some files.");
          } finally {
              setIsReadingFile(false);
          }
      }
  };

  const removeFile = (key: string, fileName: string) => {
      const existing = (formData[key] as string[]) || [];
      const contentKey = `_content_${key}`;
      
      setFormData(prev => {
          const prevContent = (prev[contentKey] as unknown as Record<string, string>) || {};
          const newContent = { ...prevContent };
          delete newContent[fileName];

          return { 
              ...prev, 
              [key]: existing.filter(f => f !== fileName),
              [contentKey]: newContent
          };
      });
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center p-4 md:p-6 animate-fade-in">
      
      <div className="w-full max-w-6xl h-[90vh] bg-surface border border-border rounded-3xl shadow-2xl flex flex-col lg:flex-row overflow-hidden">
        
        {/* LEFT PANEL: Project List */}
        <div className="lg:w-4/12 bg-background border-r border-border flex flex-col">
            <div className="p-6 border-b border-border bg-surface/50">
                <div className="flex items-center gap-2 mb-1">
                     <button onClick={onCancel} className="p-1.5 -ml-2 rounded-lg hover:bg-background text-textSecondary hover:text-textMain"><ArrowLeft size={20}/></button>
                     <h2 className="text-xl font-bold text-textMain">{t.welcome}</h2>
                </div>
                <p className="text-xs text-textSecondary">{t.subtitle}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between px-2 mb-2">
                    <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">{t.projects}</span>
                    <button 
                        onClick={() => setEditingProjectId('new')}
                        className="text-xs flex items-center gap-1 text-primary hover:underline"
                    >
                        <Plus size={12}/> {t.newProject}
                    </button>
                </div>

                {projects.length === 0 && (
                     <div className="text-center py-8 text-textSecondary text-sm italic border border-dashed border-border rounded-xl">
                         {t.noProjects} <br/> {t.createFirst}
                     </div>
                )}

                {projects.map(p => (
                    <div 
                        key={p.id} 
                        onClick={() => setEditingProjectId(p.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all relative group
                            ${editingProjectId === p.id 
                                ? 'bg-primary/5 border-primary/50 shadow-sm' 
                                : 'bg-surface border-border hover:border-primary/30'}`}
                    >
                        <div className="flex items-start justify-between">
                             <div className="flex items-center gap-3">
                                 <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeProjectId === p.id ? 'bg-primary text-white' : 'bg-background text-textSecondary'}`}>
                                     <Briefcase size={16} />
                                 </div>
                                 <div>
                                     <div className={`text-sm font-bold ${editingProjectId === p.id ? 'text-primary' : 'text-textMain'}`}>{p.name}</div>
                                     <div className="text-[10px] text-textSecondary truncate max-w-[120px]">{p.description || 'No description'}</div>
                                 </div>
                             </div>
                             {activeProjectId === p.id && (
                                 <div className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold border border-green-500/20">
                                     {t.active}
                                 </div>
                             )}
                        </div>
                        
                        {/* Hover Actions */}
                        <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {activeProjectId !== p.id && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleActivateProject(p.id); }}
                                    className="p-1.5 bg-background border border-border rounded text-textSecondary hover:text-green-500 hover:border-green-500"
                                    title={t.switchContext}
                                >
                                    <Check size={12}/>
                                </button>
                            )}
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id); }}
                                className="p-1.5 bg-background border border-border rounded text-textSecondary hover:text-red-500 hover:border-red-500"
                            >
                                <X size={12}/>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="p-4 border-t border-border bg-surface/30">
                <button 
                    onClick={() => setEditingProjectId('new')}
                    className="w-full py-3 border-2 border-dashed border-border rounded-xl text-textSecondary hover:text-primary hover:border-primary hover:bg-surface transition-all flex items-center justify-center gap-2 text-sm font-medium"
                >
                    <Plus size={16} />
                    {t.newProject}
                </button>
            </div>
        </div>

        {/* RIGHT PANEL: Editor */}
        <div className="flex-1 bg-surface flex flex-col h-full overflow-hidden relative">
             <div className="flex-1 overflow-y-auto p-8 md:p-12 scrollbar-hide">
                 <form id="profile-form" onSubmit={handleSaveProject} className="space-y-8 max-w-2xl mx-auto">
                    
                    {/* Project Meta */}
                    <div className="space-y-4 pb-6 border-b border-border">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-textMain">{t.contextName} <span className="text-red-500">*</span></label>
                            <input 
                                type="text"
                                value={projectName}
                                onChange={e => setProjectName(e.target.value)}
                                placeholder="e.g. Q4 Marketing Campaign"
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-textMain focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-lg font-bold"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-textSecondary">{t.contextDesc}</label>
                            <input 
                                type="text"
                                value={projectDesc}
                                onChange={e => setProjectDesc(e.target.value)}
                                placeholder="Briefly describe what this project is about..."
                                className="w-full bg-background border border-border rounded-xl px-4 py-2 text-sm text-textMain focus:border-primary outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Dynamic Fields */}
                    {formConfig.map((field) => (
                        <div key={field.id} className="space-y-2 group">
                            <label className="block text-sm font-bold text-textMain group-hover:text-primary transition-colors">
                                {field.label} {field.required && <span className="text-red-500">*</span>}
                            </label>
                            
                            {field.type === 'textarea' ? (
                                <textarea 
                                    value={formData[field.key] as string || ''}
                                    onChange={e => handleChange(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    className="w-full h-32 bg-background border border-border rounded-xl px-4 py-3 text-textMain focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none shadow-sm"
                                />
                            ) : field.type === 'select' ? (
                                <div className="relative">
                                    <select
                                        value={formData[field.key] as string || ''}
                                        onChange={e => handleChange(field.key, e.target.value)}
                                        className={`w-full bg-background border rounded-xl px-4 py-3 text-textMain focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all appearance-none cursor-pointer shadow-sm
                                            ${(formData[field.key] === undefined || formData[field.key] === '') ? 'text-textSecondary border-border' : 'text-textMain border-primary/50'}`}
                                    >
                                        <option value="" disabled>Select an option</option>
                                        {field.options?.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-textSecondary">
                                        <ChevronRight size={14} className="rotate-90"/>
                                    </div>
                                </div>
                            ) : field.type === 'file' ? (
                                <div className="space-y-3">
                                    <div 
                                        className="border-2 border-dashed border-border hover:border-primary/50 bg-background hover:bg-background/80 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all group/upload relative"
                                        onClick={() => !isReadingFile && document.getElementById(`file-${field.id}`)?.click()}
                                    >
                                        {isReadingFile ? (
                                            <div className="flex flex-col items-center">
                                                <Loader2 size={24} className="text-primary animate-spin mb-2" />
                                                <p className="text-xs text-textSecondary">Reading file contents...</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="w-10 h-10 bg-surface rounded-full flex items-center justify-center mb-2 group-hover/upload:scale-110 transition-transform shadow-sm border border-border">
                                                    <Upload size={18} className="text-primary" />
                                                </div>
                                                <p className="text-xs font-medium text-textMain">Upload documents (Text/PDF/JSON)</p>
                                            </>
                                        )}
                                        <input 
                                            id={`file-${field.id}`}
                                            type="file" 
                                            multiple
                                            className="hidden"
                                            onChange={(e) => handleFileChange(field.key, e)}
                                            disabled={isReadingFile}
                                        />
                                    </div>
                                    
                                    {(formData[field.key] as string[])?.length > 0 && (
                                        <div className="grid grid-cols-1 gap-2">
                                            {(formData[field.key] as string[]).map((fileName, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-2.5 bg-background border border-border rounded-lg animate-fade-in shadow-sm">
                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                        <FileText size={14} className="text-primary shrink-0" />
                                                        <div className="flex flex-col">
                                                            <span className="text-xs text-textMain truncate font-medium">{fileName}</span>
                                                            <span className="text-[9px] text-green-500 flex items-center gap-1">
                                                                <Check size={8}/> Content Loaded
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        type="button"
                                                        onClick={() => removeFile(field.key, fileName)}
                                                        className="p-1 text-textSecondary hover:text-red-500 hover:bg-surface rounded transition-colors"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                 </div>
                            ) : (
                                <input 
                                    type={field.type}
                                    value={formData[field.key] as string || ''}
                                    onChange={e => handleChange(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-textMain focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm"
                                />
                            )}
                        </div>
                    ))}
                 </form>
             </div>

             {/* Footer */}
             <div className="p-6 md:px-12 md:py-8 border-t border-border bg-surface/95 backdrop-blur z-10">
                <div className="max-w-2xl mx-auto space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm flex items-start gap-2 animate-fade-in">
                            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                    <div className="flex justify-end">
                        <button 
                            onClick={handleSaveProject}
                            className="px-8 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold text-lg shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                        >
                            {tCommon.save}
                            <ArrowRight size={20} />
                        </button>
                    </div>
                </div>
             </div>
        </div>

      </div>
    </div>
  );
};

export default ProfileComplete;