
import React, { useState, useEffect } from 'react';
import { Language, ModelConfig } from '../../types';
import { translations } from '../../utils/translations';
import { storage } from '../../utils/storage';
import { Save, CheckCircle, Sliders, Brain, Lightbulb, MousePointerClick, Box, List, Trash2, CheckSquare, Plus, Tag, TrendingUp, Palette, LayoutTemplate, Target, Database, Copy, Server, Key, Globe, Play, Edit, X, AlertCircle, Loader2, Zap } from 'lucide-react';
import { POSTGRES_SCHEMA } from '../../utils/postgresSchema'; // Import the schema
import { api } from '../../utils/api';
import { extractPreferences } from '../../utils/preferences';

interface SettingsTabProps {
    language: Language;
    agentCategories: string[];
    onUpdateCategories: (categories: string[]) => void;
    onToggleTrendAnalysis?: (enabled: boolean) => void;
    onToggleStylePrompt?: (enabled: boolean) => void;
    onToggleSimulator?: (enabled: boolean) => void; 
    onToggleGoalLanding?: (enabled: boolean) => void; 
}

const SettingsTab: React.FC<SettingsTabProps> = ({ language, agentCategories, onUpdateCategories, onToggleTrendAnalysis, onToggleStylePrompt, onToggleSimulator, onToggleGoalLanding }) => {
    const t = translations[language]?.admin || translations['en'].admin;
    const tCommon = translations[language]?.common || translations['en'].common;

    // Local State reflecting storage
    const [systemSettings, setSystemSettings] = useState({
        appName: 'Nexus AI',
        defaultLanguage: 'en',
        temperature: 0.7,
        maxTokens: 2048,
        allowSignups: true,
        maintenanceMode: false
    });

    // ===== 从线上数据库（/api/preferences）加载，不再依赖 localStorage =====
    const [apiConfig, setApiConfig] = useState({
        modelName: 'gemini-3-flash-preview',
        allowModelSelect: true,
        availableModels: [] as ModelConfig[],
    });

    const [showContextDrawer, setShowContextDrawer] = useState(true);
    const [showThoughtChain, setShowThoughtChain] = useState(true);
    const [showFollowUps, setShowFollowUps] = useState(true);
    const [showRichActions, setShowRichActions] = useState(true);
    const [showTrendAnalysis, setShowTrendAnalysis] = useState(true);
    const [showSimulator, setShowSimulator] = useState(true);
    const [enableStylePrompt, setEnableStylePrompt] = useState(true);
    const [showGoalLanding, setShowGoalLanding] = useState(false);
    const [enableWebSocket, setEnableWebSocket] = useState(false);

    const [newModelId, setNewModelId] = useState('');
    const [newModelName, setNewModelName] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [showSaveToast, setShowSaveToast] = useState(false);
    
    // Database Tab State
    const [activeSection, setActiveSection] = useState<'general' | 'api-config' | 'database'>('general');
    const [copiedSchema, setCopiedSchema] = useState(false);

    // API Config State
    const [apiConfigs, setApiConfigs] = useState<any[]>([]);
    const [loadingConfigs, setLoadingConfigs] = useState(false);
    const [editingConfig, setEditingConfig] = useState<any | null>(null);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [testingConfigId, setTestingConfigId] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<{ 
      success: boolean; 
      message: string; 
      results?: any[];
      summary?: { total: number; passed: number; failed: number };
    } | null>(null);
    
    // Gemini API Key State
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [geminiApiKeyHint, setGeminiApiKeyHint] = useState('');
    const [loadingGeminiKey, setLoadingGeminiKey] = useState(false);

    // 进入设置页时拉取系统级设置（全局生效，所有用户共享）
    useEffect(() => {
        const loadSystemSettings = async () => {
            try {
                const settings = await api.systemSettings.get();

                setApiConfig(prev => ({
                    ...prev,
                    modelName: settings.modelName || prev.modelName,
                    allowModelSelect: settings.allowModelSelect ?? prev.allowModelSelect,
                    availableModels: settings.availableModels?.length ? settings.availableModels : prev.availableModels,
                }));

                setShowContextDrawer(settings.showContextDrawer ?? true);
                setShowThoughtChain(settings.showThoughtChain ?? true);
                setShowFollowUps(settings.showFollowUps ?? true);
                setShowRichActions(settings.showRichActions ?? true);
                setShowTrendAnalysis(settings.showTrendAnalysis ?? true);
                setShowSimulator(settings.showSimulator ?? true);
                setEnableStylePrompt(settings.enableStylePrompt ?? true);
                setShowGoalLanding(settings.showGoalLanding ?? false);
                setEnableWebSocket(settings.enableWebSocket ?? false);
            } catch (e) {
                // 不要白屏：失败时保持默认值
                console.error('Failed to load system settings:', e);
            }
        };
        loadSystemSettings();
    }, []);

    const loadGeminiApiKey = async () => {
        try {
            setLoadingGeminiKey(true);
            const settings = await api.admin.getSettings();
            // 后端会返回脱敏后的 gemini_api_key（例如 "...abcd"）以及 gemini_api_key_has_value
            const hint = settings?.gemini_api_key || '';
            setGeminiApiKeyHint(hint);
        } catch (error) {
            console.error('Failed to load Gemini API key:', error);
            // 不要让页面崩溃，保持为空即可
            setGeminiApiKeyHint('');
        } finally {
            setLoadingGeminiKey(false);
        }
    };

    const handleSaveGeminiApiKey = async () => {
        if (!geminiApiKey.trim()) return;
        try {
            setLoadingGeminiKey(true);
            await api.admin.updateSettings('gemini_api_key', geminiApiKey.trim(), 'Gemini API Key (fallback)');
            setGeminiApiKey('');
            await loadGeminiApiKey();
            alert(language === 'zh' ? 'Gemini Key 已保存' : 'Gemini key saved');
        } catch (error) {
            console.error('Failed to save Gemini API key:', error);
            alert(language === 'zh' ? '保存 Gemini Key 失败' : 'Failed to save Gemini key');
        } finally {
            setLoadingGeminiKey(false);
        }
    };

    // Handlers
    const handleAddModel = () => {
        if (!newModelId || !newModelName) return;
        const newModel: ModelConfig = { id: newModelId.trim(), name: newModelName.trim() };
        setApiConfig(prev => ({
            ...prev,
            availableModels: [...prev.availableModels, newModel]
        }));
        setNewModelId('');
        setNewModelName('');
    };

    const handleRemoveModel = (id: string) => {
        setApiConfig(prev => ({
            ...prev,
            availableModels: prev.availableModels.filter(m => m.id !== id)
        }));
    };

    const handleAddCategory = () => {
        if (newCategory && !agentCategories.includes(newCategory)) {
            const updated = [...agentCategories, newCategory.trim()];
            onUpdateCategories(updated);
            setNewCategory('');
        }
    };

    const handleRemoveCategory = (cat: string) => {
        if (confirm(`Remove category "${cat}"? Agents using this category will not be deleted but may display incorrectly until updated.`)) {
            const updated = agentCategories.filter(c => c !== cat);
            onUpdateCategories(updated);
        }
    };

    const handleSaveSettings = async () => {
        try {
            // 保存到系统级全局设置（所有用户共享）
            await api.systemSettings.update({
                modelName: apiConfig.modelName,
                availableModels: apiConfig.availableModels,
                allowModelSelect: apiConfig.allowModelSelect,
                showContextDrawer,
                showThoughtChain,
                showFollowUps,
                showRichActions,
                showTrendAnalysis,
                showSimulator,
                enableStylePrompt,
                showGoalLanding,
                enableWebSocket,
            });
            
            // 触发父组件的回调（更新 App.tsx 状态）
            if (onToggleTrendAnalysis) onToggleTrendAnalysis(showTrendAnalysis);
            if (onToggleSimulator) onToggleSimulator(showSimulator); 
            if (onToggleStylePrompt) onToggleStylePrompt(enableStylePrompt);
            if (onToggleGoalLanding) onToggleGoalLanding(showGoalLanding);
            
            setShowSaveToast(true);
            setTimeout(() => setShowSaveToast(false), 3000);
            console.log('✅ System settings saved (global for all users)');
        } catch (error) {
            console.error('Failed to save system settings:', error);
            alert(language === 'zh' ? '保存失败，请重试' : 'Save failed, please retry');
        }
    };
    

    const handleResetDemo = () => {
        if (confirm('Are you sure? This will delete all local data (users, chat history, projects) and reload the page.')) {
            storage.clearAll();
        }
    };

    const handleCopySchema = () => {
        navigator.clipboard.writeText(POSTGRES_SCHEMA);
        setCopiedSchema(true);
        setTimeout(() => setCopiedSchema(false), 2000);
    };

    // ============================================
    // API 配置管理
    // ============================================
    useEffect(() => {
        if (activeSection === 'api-config') {
            loadApiConfigs();
        }
        if (activeSection === 'general') {
            loadGeminiApiKey();
        }
    }, [activeSection]);

    const loadApiConfigs = async () => {
        try {
            setLoadingConfigs(true);
            const configs = await api.apiConfigs.getAll();
            setApiConfigs(configs);
        } catch (error) {
            console.error('Failed to load API configs:', error);
        } finally {
            setLoadingConfigs(false);
        }
    };

    const handleCreateConfig = () => {
        setEditingConfig({
            name: '',
            provider: 'newapi',
            apiKey: '',
            baseUrl: '',
            modelMapping: {},
            description: '',
            requestConfig: {
                authHeaderFormat: 'Bearer {apiKey}',
                testEndpoint: '/v1/models',
                testMethod: 'GET',
            },
            isActive: true,
        });
        setShowConfigModal(true);
        setTestResult(null);
    };

    const handleEditConfig = async (id: string) => {
        try {
            const config = await api.apiConfigs.getById(id);
            setEditingConfig(config);
            setShowConfigModal(true);
            setTestResult(null);
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    };

    const handleSaveConfig = async () => {
        if (!editingConfig) return;

        try {
            if (editingConfig.id) {
                await api.apiConfigs.update(editingConfig.id, editingConfig);
            } else {
                await api.apiConfigs.create(editingConfig);
            }
            setShowConfigModal(false);
            setEditingConfig(null);
            loadApiConfigs();
        } catch (error) {
            console.error('Failed to save config:', error);
            alert(language === 'zh' ? '保存失败' : 'Failed to save');
        }
    };

    const handleDeleteConfig = async (id: string) => {
        if (!confirm(language === 'zh' ? '确定删除此 API 配置？' : 'Are you sure you want to delete this API config?')) {
            return;
        }

        try {
            await api.apiConfigs.delete(id);
            loadApiConfigs();
        } catch (error) {
            console.error('Failed to delete config:', error);
            alert(language === 'zh' ? '删除失败' : 'Failed to delete');
        }
    };

    const handleTestConfig = async (id: string) => {
        if (!id) {
            console.error('❌ No config ID provided');
            alert(language === 'zh' ? '配置 ID 无效' : 'Invalid config ID');
            return;
        }

        console.log('🔍 Testing config:', id);
        try {
            setTestingConfigId(id);
            setTestResult(null);
            console.log('📡 Calling API test endpoint...');
            
            const result = await api.apiConfigs.test(id);
            console.log('✅ Test result:', result);
            
            if (result) {
                setTestResult(result);
            } else {
                throw new Error(language === 'zh' ? '未收到测试结果' : 'No test result received');
            }
        } catch (error: any) {
            console.error('❌ Test error:', error);
            const errorMessage = error?.message || error?.error || (language === 'zh' ? '测试失败，请检查网络连接和 API 配置' : 'Test failed, please check network and API config');
            setTestResult({
                success: false,
                message: errorMessage,
            });
            // 显示错误提示
            alert(errorMessage);
        } finally {
            // 延迟清除测试状态，让用户看到结果
            setTimeout(() => {
                setTestingConfigId(null);
            }, 2000);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Inner Tabs */}
            <div className="flex gap-4 mb-6 border-b border-border px-1">
                <button 
                    onClick={() => setActiveSection('general')}
                    className={`pb-2 text-sm font-bold transition-all ${activeSection === 'general' ? 'text-primary border-b-2 border-primary' : 'text-textSecondary hover:text-textMain'}`}
                >
                    {t.settings.general}
                </button>
                <button 
                    onClick={() => setActiveSection('api-config')}
                    className={`pb-2 text-sm font-bold transition-all flex items-center gap-2 ${activeSection === 'api-config' ? 'text-primary border-b-2 border-primary' : 'text-textSecondary hover:text-textMain'}`}
                >
                    <Key size={14}/> {language === 'zh' ? 'API 配置' : 'API Config'}
                </button>
                <button 
                    onClick={() => setActiveSection('database')}
                    className={`pb-2 text-sm font-bold transition-all flex items-center gap-2 ${activeSection === 'database' ? 'text-primary border-b-2 border-primary' : 'text-textSecondary hover:text-textMain'}`}
                >
                    <Database size={14}/> {language === 'zh' ? '数据库配置' : 'Database Config'}
                </button>
            </div>

            {activeSection === 'general' && (
                <div className="bg-surface border border-border rounded-xl p-6 md:p-8 animate-fade-in max-w-3xl overflow-y-auto">
                    <div className="space-y-6">
                        {/* Feature Toggles */}
                        <div className="p-4 bg-background/50 rounded-xl border border-border shadow-inner space-y-4">
                             <h3 className="font-bold text-textMain flex items-center gap-2">
                                 <Sliders size={16} className="text-primary"/>
                                 {t.settings.accessControl}
                             </h3>
                             
                             {/* Goal Landing Toggle */}
                             <div className="flex items-center justify-between pb-4 border-b border-border">
                                  <div>
                                      <div className="font-bold text-textMain text-sm flex items-center gap-2">
                                          <Target size={14} className="text-emerald-500" />
                                          {t.settings.goalLanding}
                                      </div>
                                      <div className="text-xs text-textSecondary">{t.settings.goalLandingDesc}</div>
                                  </div>
                                  <button 
                                      onClick={() => setShowGoalLanding(!showGoalLanding)}
                                      className={`w-12 h-6 rounded-full p-1 transition-colors ${showGoalLanding ? 'bg-primary' : 'bg-border'}`}
                                  >
                                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showGoalLanding ? 'translate-x-6' : ''}`}></div>
                                  </button>
                             </div>

                             {/* Context Drawer Toggle */}
                             <div className="flex items-center justify-between pb-4 border-b border-border">
                                  <div>
                                      <div className="font-bold text-textMain text-sm">{t.settings.contextDrawer}</div>
                                      <div className="text-xs text-textSecondary">{t.settings.contextDrawerDesc}</div>
                                  </div>
                                  <button 
                                      onClick={() => setShowContextDrawer(!showContextDrawer)}
                                      className={`w-12 h-6 rounded-full p-1 transition-colors ${showContextDrawer ? 'bg-primary' : 'bg-border'}`}
                                  >
                                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showContextDrawer ? 'translate-x-6' : ''}`}></div>
                                  </button>
                             </div>

                             {/* Thought Chain Toggle */}
                             <div className="flex items-center justify-between pb-4 border-b border-border">
                                  <div>
                                      <div className="font-bold text-textMain text-sm flex items-center gap-2">
                                          <Brain size={14} className="text-accent" />
                                          {t.settings.thoughtChain}
                                      </div>
                                      <div className="text-xs text-textSecondary">{t.settings.thoughtChainDesc}</div>
                                  </div>
                                  <button 
                                      onClick={() => setShowThoughtChain(!showThoughtChain)}
                                      className={`w-12 h-6 rounded-full p-1 transition-colors ${showThoughtChain ? 'bg-primary' : 'bg-border'}`}
                                  >
                                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showThoughtChain ? 'translate-x-6' : ''}`}></div>
                                  </button>
                             </div>

                             {/* Style Prompt Toggle */}
                             <div className="flex items-center justify-between pb-4 border-b border-border">
                                  <div>
                                      <div className="font-bold text-textMain text-sm flex items-center gap-2">
                                          <Palette size={14} className="text-pink-500" />
                                          {t.settings.stylePrompt}
                                      </div>
                                      <div className="text-xs text-textSecondary">{t.settings.stylePromptDesc}</div>
                                  </div>
                                  <button 
                                      onClick={() => setEnableStylePrompt(!enableStylePrompt)}
                                      className={`w-12 h-6 rounded-full p-1 transition-colors ${enableStylePrompt ? 'bg-primary' : 'bg-border'}`}
                                  >
                                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${enableStylePrompt ? 'translate-x-6' : ''}`}></div>
                                  </button>
                             </div>

                             {/* Follow-Ups Toggle */}
                             <div className="flex items-center justify-between pb-4 border-b border-border">
                                  <div>
                                      <div className="font-bold text-textMain text-sm flex items-center gap-2">
                                          <Lightbulb size={14} className="text-yellow-500" />
                                          {t.settings.followUps}
                                      </div>
                                      <div className="text-xs text-textSecondary">{t.settings.followUpsDesc}</div>
                                  </div>
                                  <button 
                                      onClick={() => setShowFollowUps(!showFollowUps)}
                                      className={`w-12 h-6 rounded-full p-1 transition-colors ${showFollowUps ? 'bg-primary' : 'bg-border'}`}
                                  >
                                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showFollowUps ? 'translate-x-6' : ''}`}></div>
                                  </button>
                             </div>

                             {/* Rich Actions Toggle */}
                             <div className="flex items-center justify-between pb-4 border-b border-border">
                                  <div>
                                      <div className="font-bold text-textMain text-sm flex items-center gap-2">
                                          <MousePointerClick size={14} className="text-primary" />
                                          {t.settings.richActions}
                                      </div>
                                      <div className="text-xs text-textSecondary">{t.settings.richActionsDesc}</div>
                                  </div>
                                  <button 
                                      onClick={() => setShowRichActions(!showRichActions)}
                                      className={`w-12 h-6 rounded-full p-1 transition-colors ${showRichActions ? 'bg-primary' : 'bg-border'}`}
                                  >
                                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showRichActions ? 'translate-x-6' : ''}`}></div>
                                  </button>
                             </div>

                             {/* Trend Analysis Toggle */}
                             <div className="flex items-center justify-between pb-4 border-b border-border">
                                  <div>
                                      <div className="font-bold text-textMain text-sm flex items-center gap-2">
                                          <TrendingUp size={14} className="text-pink-500" />
                                          {t.settings.trendAnalysis}
                                      </div>
                                      <div className="text-xs text-textSecondary">{t.settings.trendAnalysisDesc}</div>
                                  </div>
                                  <button 
                                      onClick={() => setShowTrendAnalysis(!showTrendAnalysis)}
                                      className={`w-12 h-6 rounded-full p-1 transition-colors ${showTrendAnalysis ? 'bg-primary' : 'bg-border'}`}
                                  >
                                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showTrendAnalysis ? 'translate-x-6' : ''}`}></div>
                                  </button>
                             </div>

                             {/* Simulator Toggle */}
                             <div className="flex items-center justify-between pb-4 border-b border-border">
                                  <div>
                                      <div className="font-bold text-textMain text-sm flex items-center gap-2">
                                          <LayoutTemplate size={14} className="text-red-500" />
                                          RedNote Simulator
                                      </div>
                                      <div className="text-xs text-textSecondary">Enable the Xiaohongshu/RedNote post preview tool.</div>
                                  </div>
                                  <button 
                                      onClick={() => setShowSimulator(!showSimulator)}
                                      className={`w-12 h-6 rounded-full p-1 transition-colors ${showSimulator ? 'bg-primary' : 'bg-border'}`}
                                  >
                                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showSimulator ? 'translate-x-6' : ''}`}></div>
                                  </button>
                             </div>

                             {/* WebSocket Toggle */}
                             <div className="flex items-center justify-between">
                                  <div>
                                      <div className="font-bold text-textMain text-sm flex items-center gap-2">
                                          <Zap size={14} className="text-yellow-500" />
                                          {language === 'zh' ? 'WebSocket 模式' : 'WebSocket Mode'}
                                      </div>
                                      <div className="text-xs text-textSecondary">
                                          {language === 'zh' 
                                              ? '启用后聊天页面显示 WebSocket 切换按钮（类似 ChatGPT/Claude）' 
                                              : 'Show WebSocket toggle button in chat (like ChatGPT/Claude)'}
                                      </div>
                                  </div>
                                  <button 
                                      onClick={() => setEnableWebSocket(!enableWebSocket)}
                                      className={`w-12 h-6 rounded-full p-1 transition-colors ${enableWebSocket ? 'bg-primary' : 'bg-border'}`}
                                  >
                                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${enableWebSocket ? 'translate-x-6' : ''}`}></div>
                                  </button>
                             </div>
                        </div>

                        {/* API Configuration */}
                        <div className="p-4 bg-background/50 rounded-xl border border-border shadow-inner space-y-4">
                            <h3 className="font-bold text-textMain mb-4 flex items-center gap-2">
                                <Box size={16} className="text-primary"/>
                                {t.settings.apiConfig}
                            </h3>
                            
                            {/* Gemini API Key Configuration */}
                            <div className="p-3 bg-surface border border-border rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-textSecondary uppercase flex items-center gap-2">
                                        <Key size={12}/>
                                        Gemini API Key (Fallback)
                                    </label>
                                    {geminiApiKeyHint && (
                                        <span className="text-xs text-textSecondary font-mono">{geminiApiKeyHint}</span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <input 
                                        type="password" 
                                        value={geminiApiKey} 
                                        onChange={e => setGeminiApiKey(e.target.value)}
                                        placeholder={geminiApiKeyHint ? "输入新 key 以更新" : "输入 Gemini API Key"}
                                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none font-mono"
                                    />
                                    <button
                                        onClick={handleSaveGeminiApiKey}
                                        disabled={!geminiApiKey.trim() || loadingGeminiKey}
                                        className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loadingGeminiKey ? (language === 'zh' ? '加载中...' : 'Loading...') : (language === 'zh' ? '保存' : 'Save')}
                                    </button>
                                </div>
                                <p className="text-xs text-textSecondary mt-2">
                                    {language === 'zh' 
                                        ? '当 NewAPI 不可用时，系统会使用 Gemini API 作为备用方案' 
                                        : 'System will use Gemini API as fallback when NewAPI is unavailable'}
                                </p>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-4">
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-textSecondary uppercase block mb-2">Default System Model</label>
                                        <div className="relative">
                                            <Box size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary"/>
                                            <input 
                                                type="text" 
                                                value={apiConfig.modelName} 
                                                onChange={e => setApiConfig({...apiConfig,modelName: e.target.value})} 
                                                className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-textMain focus:border-primary outline-none font-mono"
                                                placeholder="e.g. gemini-3-flash-preview"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Model List Management */}
                        <div className="p-4 bg-background/50 rounded-xl border border-border shadow-inner">
                             <div className="flex items-center justify-between mb-4">
                                  <h3 className="font-bold text-textMain flex items-center gap-2">
                                      <List size={16} className="text-primary"/>
                                      Available Models
                                  </h3>
                                  <div className="flex items-center gap-2">
                                       <span className="text-xs font-bold text-textSecondary">User Selectable</span>
                                       <button 
                                          onClick={() => {
                                              const newValue = !apiConfig.allowModelSelect;
                                              setApiConfig({...apiConfig, allowModelSelect: newValue});
                                              storage.saveAllowModelSelect(newValue); 
                                          }}
                                          className={`w-10 h-5 rounded-full p-0.5 transition-colors ${apiConfig.allowModelSelect ? 'bg-primary' : 'bg-border'}`}
                                      >
                                          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${apiConfig.allowModelSelect ? 'translate-x-5' : ''}`}></div>
                                      </button>
                                  </div>
                             </div>

                             <div className="space-y-3">
                                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                      {apiConfig.availableModels.map(model => (
                                          <div key={model.id} className="flex items-center gap-2 bg-surface border border-border rounded-lg p-2">
                                               <div className="flex-1 min-w-0">
                                                   <div className="text-xs font-bold text-textMain">{model.name}</div>
                                                   <div className="text-[10px] text-textSecondary font-mono">{model.id}</div>
                                               </div>
                                               <button onClick={() => handleRemoveModel(model.id)} className="p-1.5 hover:bg-background rounded text-textSecondary hover:text-red-500">
                                                   <Trash2 size={14} />
                                               </button>
                                          </div>
                                      ))}
                                  </div>
                                  
                                  <div className="flex gap-2 items-end pt-2 border-t border-border">
                                       <div className="flex-1">
                                           <label className="text-[10px] font-bold text-textSecondary uppercase block mb-1">Model ID</label>
                                           <input 
                                              type="text" 
                                              value={newModelId} 
                                              onChange={e => setNewModelId(e.target.value)}
                                              placeholder="gemini-3-flash-preview" 
                                              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-textMain focus:border-primary outline-none font-mono"
                                           />
                                       </div>
                                       <div className="flex-1">
                                           <label className="text-[10px] font-bold text-textSecondary uppercase block mb-1">Name</label>
                                           <input 
                                              type="text" 
                                              value={newModelName} 
                                              onChange={e => setNewModelName(e.target.value)}
                                              placeholder="Gemini 3 Flash" 
                                              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-textMain focus:border-primary outline-none"
                                           />
                                       </div>
                                       <button onClick={handleAddModel} className="px-3 py-1.5 bg-primary text-white rounded text-xs font-bold h-[30px] hover:brightness-110">
                                           Add
                                       </button>
                                  </div>
                             </div>
                        </div>

                        {/* Agent Categories Management */}
                        <div className="p-4 bg-background/50 rounded-xl border border-border shadow-inner">
                            <h3 className="font-bold text-textMain mb-4 flex items-center gap-2">
                                <Tag size={16} className="text-primary"/>
                                {t.settings.agentCategories}
                            </h3>
                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                    {agentCategories.map(cat => (
                                        <div key={cat} className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-bold text-textMain">
                                            {cat}
                                            <button onClick={() => handleRemoveCategory(cat)} className="text-textSecondary hover:text-red-500 rounded p-0.5 hover:bg-background transition-colors">
                                                <Trash2 size={12}/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder={t.settings.newCategoryPlaceholder} 
                                        value={newCategory}
                                        onChange={(e) => setNewCategory(e.target.value)}
                                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-textMain focus:border-primary outline-none"
                                    />
                                    <button onClick={handleAddCategory} className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:brightness-110 flex items-center gap-1">
                                        <Plus size={14}/> {tCommon.add}
                                    </button>
                                </div>
                            </div>
                        </div>

                         <div className="pt-6 flex justify-end gap-3">
                             <button onClick={handleResetDemo} className="px-4 py-2 text-red-500 hover:bg-red-500/10 rounded-lg text-sm font-medium transition-colors">Reset Demo Data</button>
                             <button onClick={handleSaveSettings} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:brightness-110 shadow-lg shadow-primary/20 transition-all flex items-center gap-2">
                                 {showSaveToast && <CheckCircle size={14} />}
                                 {tCommon.save}
                             </button>
                         </div>
                    </div>
                </div>
            )}

            {activeSection === 'api-config' && (
                <div className="bg-surface border border-border rounded-xl p-6 md:p-8 animate-fade-in max-w-4xl overflow-y-auto">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-textMain flex items-center gap-2">
                                <Key size={20} className="text-primary"/>
                                {language === 'zh' ? 'API 配置管理' : 'API Configuration'}
                            </h2>
                            <p className="text-sm text-textSecondary mt-1">
                                {language === 'zh' ? '配置第三方 API（如 newapi）的密钥和适配参数' : 'Configure API keys and adapters for third-party services'}
                            </p>
                        </div>
                        <button
                            onClick={handleCreateConfig}
                            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:brightness-110 flex items-center gap-2"
                        >
                            <Plus size={16}/>
                            {language === 'zh' ? '添加配置' : 'Add Config'}
                        </button>
                    </div>

                    {loadingConfigs ? (
                        <div className="flex items-center justify-center h-32">
                            <Loader2 className="w-6 h-6 animate-spin text-primary"/>
                        </div>
                    ) : apiConfigs.length === 0 ? (
                        <div className="text-center py-12 text-textSecondary">
                            <Key size={48} className="mx-auto mb-4 opacity-50"/>
                            <p>{language === 'zh' ? '暂无 API 配置' : 'No API configurations yet'}</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {apiConfigs.map((config) => {
                                console.log('📋 Rendering config:', config.id, config.name);
                                return (
                                    <div key={config.id} className="bg-background border border-border rounded-xl p-5">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-bold text-textMain">{config.name}</h3>
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                    config.isActive 
                                                        ? 'bg-green-500/10 text-green-500' 
                                                        : 'bg-gray-500/10 text-gray-500'
                                                }`}>
                                                    {config.isActive ? (language === 'zh' ? '启用' : 'Active') : (language === 'zh' ? '禁用' : 'Inactive')}
                                                </span>
                                                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-500">
                                                    {config.provider}
                                                </span>
                                            </div>
                                            <div className="space-y-1 text-sm text-textSecondary">
                                                <div className="flex items-center gap-2">
                                                    <Globe size={14}/>
                                                    <span className="font-mono text-xs">{config.baseUrl}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Key size={14}/>
                                                    <span className="font-mono text-xs">{config.apiKeyHint || '****'}</span>
                                                </div>
                                                {config.description && (
                                                    <p className="text-xs mt-2">{config.description}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    console.log('🔘 Test button clicked for config:', config.id);
                                                    if (!config.id) {
                                                        alert(language === 'zh' ? '配置 ID 无效' : 'Invalid config ID');
                                                        return;
                                                    }
                                                    handleTestConfig(config.id);
                                                }}
                                                disabled={testingConfigId === config.id || !config.id}
                                                className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                                                title={language === 'zh' ? '测试连接' : 'Test Connection'}
                                            >
                                                {testingConfigId === config.id ? (
                                                    <>
                                                        <Loader2 size={14} className="animate-spin"/>
                                                        <span className="text-xs">{language === 'zh' ? '测试中...' : 'Testing...'}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Play size={14}/>
                                                        <span className="text-xs">{language === 'zh' ? '测试' : 'Test'}</span>
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleEditConfig(config.id)}
                                                className="p-2 hover:bg-surface rounded-lg text-textSecondary hover:text-primary transition-colors"
                                                title={language === 'zh' ? '编辑' : 'Edit'}
                                            >
                                                <Edit size={16}/>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteConfig(config.id)}
                                                className="p-2 hover:bg-surface rounded-lg text-textSecondary hover:text-red-500 transition-colors"
                                                title={language === 'zh' ? '删除' : 'Delete'}
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        </div>
                                    </div>
                                    {testResult && testingConfigId === config.id && (
                                        <div className={`mt-3 p-4 rounded-lg border ${
                                            testResult.success 
                                                ? 'bg-green-500/10 border-green-500/20' 
                                                : 'bg-red-500/10 border-red-500/20'
                                        }`}>
                                            <div className="flex items-start gap-2 mb-2">
                                                {testResult.success ? (
                                                    <CheckCircle size={18} className="text-green-500 mt-0.5"/>
                                                ) : (
                                                    <AlertCircle size={18} className="text-red-500 mt-0.5"/>
                                                )}
                                                <div className="flex-1">
                                                    <p className={`text-sm font-medium ${
                                                        testResult.success ? 'text-green-500' : 'text-red-500'
                                                    }`}>
                                                        {testResult.message}
                                                    </p>
                                                    {testResult.summary && (
                                                        <p className="text-xs text-textSecondary mt-1">
                                                            {language === 'zh' 
                                                                ? `测试结果: ${testResult.summary.passed}/${testResult.summary.total} 通过`
                                                                : `Test Results: ${testResult.summary.passed}/${testResult.summary.total} passed`
                                                            }
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {/* 详细测试结果 */}
                                            {testResult.results && testResult.results.length > 0 && (
                                                <div className="mt-3 space-y-2">
                                                    {testResult.results.map((result: any, idx: number) => (
                                                        <div 
                                                            key={idx} 
                                                            className={`p-2 rounded text-xs ${
                                                                result.success 
                                                                    ? 'bg-green-500/5 text-green-400' 
                                                                    : 'bg-red-500/5 text-red-400'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {result.success ? (
                                                                    <CheckCircle size={12}/>
                                                                ) : (
                                                                    <AlertCircle size={12}/>
                                                                )}
                                                                <span className="font-medium">
                                                                    {result.test === 'models_list' 
                                                                        ? (language === 'zh' ? '模型列表' : 'Models List')
                                                                        : (language === 'zh' ? '聊天接口' : 'Chat Completion')
                                                                    }
                                                                </span>
                                                            </div>
                                                            <p className="mt-1 ml-4">{result.message}</p>
                                                            {result.models && result.models.length > 0 && (
                                                                <p className="mt-1 ml-4 text-textSecondary">
                                                                    {language === 'zh' ? '可用模型' : 'Available models'}: {result.models.join(', ')}
                                                                </p>
                                                            )}
                                                            {result.response && (
                                                                <p className="mt-1 ml-4 text-textSecondary italic">
                                                                    {language === 'zh' ? '响应' : 'Response'}: "{result.response}"
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeSection === 'database' && (
                <div className="bg-surface border border-border rounded-xl p-6 md:p-8 animate-slide-up flex-1 flex flex-col min-h-0">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                            <Server size={24} className="text-blue-500"/>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-textMain">
                                {language === 'zh' ? 'PostgreSQL 数据库配置' : 'PostgreSQL Configuration'}
                            </h2>
                            <p className="text-sm text-textSecondary mt-1">
                                {language === 'zh' 
                                    ? '当前应用使用浏览器 LocalStorage 运行。若要迁移到生产环境，请使用下方生成的 SQL Schema 在您的 PostgreSQL 数据库中建表。' 
                                    : 'Current app runs on LocalStorage. To migrate to production, use the SQL Schema below to create tables in your PostgreSQL database.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 relative border border-border rounded-xl bg-[#1e1e1e] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
                            <div className="text-xs font-mono text-gray-400">schema.sql</div>
                            <button 
                                onClick={handleCopySchema}
                                className="flex items-center gap-2 text-xs font-bold text-textSecondary hover:text-white transition-colors"
                            >
                                {copiedSchema ? <CheckCircle size={14} className="text-green-500"/> : <Copy size={14}/>}
                                {copiedSchema ? 'Copied' : 'Copy SQL'}
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            <pre className="text-xs font-mono text-blue-300 leading-relaxed whitespace-pre">
                                {POSTGRES_SCHEMA}
                            </pre>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex gap-3">
                        <Lightbulb size={20} className="text-yellow-500 flex-shrink-0 mt-0.5"/>
                        <div className="text-sm">
                            <h4 className="font-bold text-yellow-500 mb-1">
                                {language === 'zh' ? '如何连接?' : 'How to connect?'}
                            </h4>
                            <p className="text-textSecondary text-xs leading-relaxed">
                                {language === 'zh'
                                    ? '此前端应用无法直接连接数据库。您需要创建一个后端服务（如 Node.js/Express, Python/FastAPI），使用上述 SQL 建表，并提供 API 接口。然后，修改前端 `utils/storage.ts` 文件以调用您的 API。'
                                    : 'This frontend app cannot connect directly to a DB. You need to create a backend service (Node.js, Python, etc.), run the SQL above, and expose APIs. Then, update `utils/storage.ts` to fetch from your API.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* API 配置编辑弹窗 */}
            {showConfigModal && editingConfig && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-textMain">
                                {editingConfig.id 
                                    ? (language === 'zh' ? '编辑 API 配置' : 'Edit API Config')
                                    : (language === 'zh' ? '新建 API 配置' : 'New API Config')
                                }
                            </h3>
                            <button
                                onClick={() => {
                                    setShowConfigModal(false);
                                    setEditingConfig(null);
                                    setTestResult(null);
                                }}
                                className="text-textSecondary hover:text-textMain"
                            >
                                <X size={20}/>
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* 基本信息 */}
                            <div>
                                <label className="block text-sm font-medium text-textMain mb-2">
                                    {language === 'zh' ? '配置名称' : 'Config Name'} *
                                </label>
                                <input
                                    type="text"
                                    value={editingConfig.name}
                                    onChange={(e) => setEditingConfig({...editingConfig, name: e.target.value})}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none"
                                    placeholder={language === 'zh' ? '例如：NewAPI 生产环境' : 'e.g. NewAPI Production'}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-textMain mb-2">
                                        {language === 'zh' ? '提供商' : 'Provider'} *
                                    </label>
                                    <select
                                        value={editingConfig.provider}
                                        onChange={(e) => setEditingConfig({...editingConfig, provider: e.target.value})}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none"
                                    >
                                        <option value="newapi">NewAPI</option>
                                        <option value="openai">OpenAI</option>
                                        <option value="anthropic">Anthropic</option>
                                        <option value="custom">Custom</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-textMain mb-2">
                                        {language === 'zh' ? '状态' : 'Status'}
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setEditingConfig({...editingConfig, isActive: !editingConfig.isActive})}
                                            className={`w-12 h-6 rounded-full p-1 transition-colors ${editingConfig.isActive ? 'bg-primary' : 'bg-border'}`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${editingConfig.isActive ? 'translate-x-6' : ''}`}></div>
                                        </button>
                                        <span className="text-sm text-textSecondary">
                                            {editingConfig.isActive ? (language === 'zh' ? '启用' : 'Active') : (language === 'zh' ? '禁用' : 'Inactive')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-textMain mb-2">
                                    {language === 'zh' ? 'API Key' : 'API Key'} *
                                </label>
                                <input
                                    type="password"
                                    value={editingConfig.apiKey}
                                    onChange={(e) => setEditingConfig({...editingConfig, apiKey: e.target.value})}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none font-mono text-sm"
                                    placeholder={language === 'zh' ? '输入 API Key' : 'Enter API Key'}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-textMain mb-2">
                                    {language === 'zh' ? 'Base URL' : 'Base URL'} *
                                </label>
                                <input
                                    type="text"
                                    value={editingConfig.baseUrl}
                                    onChange={(e) => setEditingConfig({...editingConfig, baseUrl: e.target.value})}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none font-mono text-sm"
                                    placeholder="https://api.example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-textMain mb-2">
                                    {language === 'zh' ? '描述' : 'Description'}
                                </label>
                                <textarea
                                    value={editingConfig.description || ''}
                                    onChange={(e) => setEditingConfig({...editingConfig, description: e.target.value})}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none text-sm"
                                    rows={2}
                                    placeholder={language === 'zh' ? '可选描述信息' : 'Optional description'}
                                />
                            </div>

                            {/* 请求配置 */}
                            <div className="border-t border-border pt-4">
                                <h4 className="text-sm font-bold text-textMain mb-3">
                                    {language === 'zh' ? '请求配置' : 'Request Configuration'}
                                </h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-textSecondary mb-1">
                                            {language === 'zh' ? '认证头格式' : 'Auth Header Format'}
                                        </label>
                                        <input
                                            type="text"
                                            value={editingConfig.requestConfig?.authHeaderFormat || 'Bearer {apiKey}'}
                                            onChange={(e) => setEditingConfig({
                                                ...editingConfig,
                                                requestConfig: {
                                                    ...editingConfig.requestConfig,
                                                    authHeaderFormat: e.target.value,
                                                },
                                            })}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none font-mono text-xs"
                                            placeholder="Bearer {apiKey}"
                                        />
                                        <p className="text-xs text-textSecondary mt-1">
                                            {language === 'zh' ? '使用 {apiKey} 作为占位符' : 'Use {apiKey} as placeholder'}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-textSecondary mb-1">
                                                {language === 'zh' ? '测试端点' : 'Test Endpoint'}
                                            </label>
                                            <input
                                                type="text"
                                                value={editingConfig.requestConfig?.testEndpoint || '/v1/models'}
                                                onChange={(e) => setEditingConfig({
                                                    ...editingConfig,
                                                    requestConfig: {
                                                        ...editingConfig.requestConfig,
                                                        testEndpoint: e.target.value,
                                                    },
                                                })}
                                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none font-mono text-xs"
                                                placeholder="/v1/models"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-textSecondary mb-1">
                                                {language === 'zh' ? '测试方法' : 'Test Method'}
                                            </label>
                                            <select
                                                value={editingConfig.requestConfig?.testMethod || 'GET'}
                                                onChange={(e) => setEditingConfig({
                                                    ...editingConfig,
                                                    requestConfig: {
                                                        ...editingConfig.requestConfig,
                                                        testMethod: e.target.value,
                                                    },
                                                })}
                                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none text-xs"
                                            >
                                                <option value="GET">GET</option>
                                                <option value="POST">POST</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                            <button
                                onClick={() => {
                                    setShowConfigModal(false);
                                    setEditingConfig(null);
                                    setTestResult(null);
                                }}
                                className="px-4 py-2 text-textSecondary hover:text-textMain transition-colors"
                            >
                                {language === 'zh' ? '取消' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSaveConfig}
                                disabled={!editingConfig.name || !editingConfig.apiKey || !editingConfig.baseUrl}
                                className="px-6 py-2 bg-primary text-white rounded-lg font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Save size={16}/>
                                {language === 'zh' ? '保存' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsTab;
