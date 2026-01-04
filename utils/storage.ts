import { User, ChatSession, PromptTemplate, FormField, ThemeId, ThemeMode, Language, AgentSquad, ModelConfig, Agent } from '../types';
import { MOCK_USER, MOCK_AGENTS, DEFAULT_PROMPT_TEMPLATES } from '../constants';
import { api } from './api';

// 客户端设置（保留在 LocalStorage，因为它们是 UI 偏好）
const KEYS = {
  THEME: 'nexus_theme_v1',
  MODE: 'nexus_mode_v1',
  LANG: 'nexus_lang_v1',
  MODEL_NAME: 'nexus_model_name_v1', 
  AVAILABLE_MODELS: 'nexus_available_models_v1', 
  AGENT_CATEGORIES: 'nexus_agent_categories_v1', 
  ALLOW_MODEL_SELECT: 'nexus_allow_model_select_v1', 
  SHOW_CONTEXT_DRAWER: 'nexus_show_context_drawer_v1', 
  SHOW_THOUGHT_CHAIN: 'nexus_show_thought_chain_v1', 
  SHOW_FOLLOW_UPS: 'nexus_show_follow_ups_v1', 
  SHOW_RICH_ACTIONS: 'nexus_show_rich_actions_v1', 
  SHOW_TREND_ANALYSIS: 'nexus_show_trend_analysis_v1',
  SHOW_SIMULATOR: 'nexus_show_simulator_v1', 
  ENABLE_STYLE_PROMPT: 'nexus_enable_style_prompt_v1',
  SHOW_GOAL_LANDING: 'nexus_show_goal_landing_v1',
  TEMPLATES: 'nexus_templates_v1', // 暂时保留在本地
  ONBOARDING: 'nexus_onboarding_v1', // 暂时保留在本地
  SQUADS: 'nexus_squads_v1', // 暂时保留在本地
};

// 缓存变量（避免重复请求）
let userCache: User | null = null;
let sessionsCache: ChatSession[] | null = null;
let agentsCache: Agent[] | null = null;

export const storage = {
  // User - 从 API 获取
  saveUser: async (user: User) => {
    userCache = user;
    try {
      await api.users.updateMe({
        name: user.name,
        avatar: user.avatar,
        preferences: user.preferences,
        activeProjectId: user.activeProjectId,
      });
    } catch (error) {
      console.error('Failed to save user:', error);
      // 失败时仍保留在缓存中
    }
  },
  
  loadUser: async (): Promise<User | null> => {
    if (userCache) return userCache;
    
    try {
      const userData = await api.users.getMe();
      userCache = {
        ...userData,
        projects: userData.projects || [],
      };
      return userCache;
    } catch (error) {
      console.error('Failed to load user:', error);
      // 如果未登录，返回 null
      return null;
    }
  },

  // Sessions - 从 API 获取
  saveSessions: async (sessions: ChatSession[]) => {
    // 不缓存，每次都从数据库加载最新数据
    // sessionsCache = sessions;
  },
  
  loadSessions: async (): Promise<ChatSession[]> => {
    // 每次都从数据库加载，不使用缓存（确保获取最新数据）
    try {
      const sessions = await api.sessions.getAll();
      console.log('Loaded sessions from API:', sessions.length);
      
      // 串行加载会话消息，避免触发速率限制
      const sessionsWithMessages: ChatSession[] = [];
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        try {
          const fullSession = await api.sessions.getById(session.id);
          console.log(`Loaded session ${session.id} with ${fullSession.messages?.length || 0} messages`);
          sessionsWithMessages.push(fullSession);
          // 添加延迟，避免请求过快（只对前5个会话加载消息）
          if (i < 4) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.warn(`Failed to load messages for session ${session.id}:`, error);
          sessionsWithMessages.push({ ...session, messages: [] });
        }
      }
      
      // 更新缓存（用于其他地方的快速访问）
      sessionsCache = sessionsWithMessages;
      return sessionsWithMessages;
    } catch (error) {
      console.error('Failed to load sessions:', error);
      return [];
    }
  },

  // Agents - 从 API 获取
  saveAgents: async (agents: Agent[]) => {
    agentsCache = agents;
    // 智能体通过 API 单独保存
  },
  
  loadAgents: async (): Promise<Agent[]> => {
    // 移除缓存，每次都从数据库加载最新数据
    try {
      const agents = await api.agents.getAll();
      agentsCache = agents; // 更新缓存，但不使用缓存作为返回
      return agents;
    } catch (error) {
      console.error('Failed to load agents:', error);
      // 如果加载失败且有缓存，返回缓存
      if (agentsCache) return agentsCache;
      // 否则返回默认智能体
      return MOCK_AGENTS;
    }
  },

  // Templates - 暂时保留在本地（未来可以迁移到数据库）
  saveTemplates: (templates: PromptTemplate[]) => {
    localStorage.setItem(KEYS.TEMPLATES, JSON.stringify(templates));
  },
  loadTemplates: (): PromptTemplate[] | null => {
    const data = localStorage.getItem(KEYS.TEMPLATES);
    return data ? JSON.parse(data) : DEFAULT_PROMPT_TEMPLATES;
  },

  // Squads - 暂时保留在本地（未来可以迁移到数据库）
  saveSquads: (squads: AgentSquad[]) => {
    localStorage.setItem(KEYS.SQUADS, JSON.stringify(squads));
  },
  loadSquads: (): AgentSquad[] | null => {
    const data = localStorage.getItem(KEYS.SQUADS);
    return data ? JSON.parse(data) : [];
  },

  // Onboarding Config - 暂时保留在本地
  saveOnboardingConfig: (config: FormField[]) => {
    localStorage.setItem(KEYS.ONBOARDING, JSON.stringify(config));
  },
  loadOnboardingConfig: (): FormField[] | null => {
    const data = localStorage.getItem(KEYS.ONBOARDING);
    return data ? JSON.parse(data) : null;
  },

  // Settings - 客户端偏好，保留在 LocalStorage
  saveTheme: (theme: ThemeId) => localStorage.setItem(KEYS.THEME, theme),
  loadTheme: (): ThemeId | null => localStorage.getItem(KEYS.THEME) as ThemeId,
  
  saveMode: (mode: ThemeMode) => localStorage.setItem(KEYS.MODE, mode),
  loadMode: (): ThemeMode | null => localStorage.getItem(KEYS.MODE) as ThemeMode,

  saveLang: (lang: Language) => localStorage.setItem(KEYS.LANG, lang),
  loadLang: (): Language => {
      const lang = localStorage.getItem(KEYS.LANG);
      return (lang === 'zh') ? 'zh' : 'en';
  },

  saveModelName: (model: string) => localStorage.setItem(KEYS.MODEL_NAME, model),
  loadModelName: (): string => localStorage.getItem(KEYS.MODEL_NAME) || 'gemini-3-flash-preview',

  saveAvailableModels: (models: ModelConfig[]) => localStorage.setItem(KEYS.AVAILABLE_MODELS, JSON.stringify(models)),
  loadAvailableModels: (): ModelConfig[] => {
      const data = localStorage.getItem(KEYS.AVAILABLE_MODELS);
      return data ? JSON.parse(data) : [
          { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
          { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
          { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite' }
      ];
  },

  saveAgentCategories: (categories: string[]) => localStorage.setItem(KEYS.AGENT_CATEGORIES, JSON.stringify(categories)),
  loadAgentCategories: (): string[] => {
      const data = localStorage.getItem(KEYS.AGENT_CATEGORIES);
      return data ? JSON.parse(data) : ['General', 'Writing', 'Coding', 'Marketing', 'Data'];
  },

  saveAllowModelSelect: (allow: boolean) => localStorage.setItem(KEYS.ALLOW_MODEL_SELECT, JSON.stringify(allow)),
  loadAllowModelSelect: (): boolean => {
      const data = localStorage.getItem(KEYS.ALLOW_MODEL_SELECT);
      return data ? JSON.parse(data) : false; 
  },

  saveShowContextDrawer: (show: boolean) => localStorage.setItem(KEYS.SHOW_CONTEXT_DRAWER, JSON.stringify(show)),
  loadShowContextDrawer: (): boolean => {
      const data = localStorage.getItem(KEYS.SHOW_CONTEXT_DRAWER);
      return data ? JSON.parse(data) : false; 
  },

  saveShowThoughtChain: (show: boolean) => localStorage.setItem(KEYS.SHOW_THOUGHT_CHAIN, JSON.stringify(show)),
  loadShowThoughtChain: (): boolean => {
      const data = localStorage.getItem(KEYS.SHOW_THOUGHT_CHAIN);
      return data ? JSON.parse(data) : true; 
  },

  saveShowFollowUps: (show: boolean) => localStorage.setItem(KEYS.SHOW_FOLLOW_UPS, JSON.stringify(show)),
  loadShowFollowUps: (): boolean => {
      const data = localStorage.getItem(KEYS.SHOW_FOLLOW_UPS);
      return data ? JSON.parse(data) : true; 
  },

  saveShowRichActions: (show: boolean) => localStorage.setItem(KEYS.SHOW_RICH_ACTIONS, JSON.stringify(show)),
  loadShowRichActions: (): boolean => {
      const data = localStorage.getItem(KEYS.SHOW_RICH_ACTIONS);
      return data ? JSON.parse(data) : true; 
  },

  saveShowTrendAnalysis: (show: boolean) => localStorage.setItem(KEYS.SHOW_TREND_ANALYSIS, JSON.stringify(show)),
  loadShowTrendAnalysis: (): boolean => {
      const data = localStorage.getItem(KEYS.SHOW_TREND_ANALYSIS);
      return data ? JSON.parse(data) : true; 
  },

  saveShowSimulator: (show: boolean) => localStorage.setItem(KEYS.SHOW_SIMULATOR, JSON.stringify(show)),
  loadShowSimulator: (): boolean => {
      const data = localStorage.getItem(KEYS.SHOW_SIMULATOR);
      return data ? JSON.parse(data) : true; 
  },

  saveEnableStylePrompt: (show: boolean) => localStorage.setItem(KEYS.ENABLE_STYLE_PROMPT, JSON.stringify(show)),
  loadEnableStylePrompt: (): boolean => {
      const data = localStorage.getItem(KEYS.ENABLE_STYLE_PROMPT);
      return data ? JSON.parse(data) : true; 
  },

  saveShowGoalLanding: (show: boolean) => localStorage.setItem(KEYS.SHOW_GOAL_LANDING, JSON.stringify(show)),
  loadShowGoalLanding: (): boolean => {
      const data = localStorage.getItem(KEYS.SHOW_GOAL_LANDING);
    return data ? JSON.parse(data) : false;
  },

  // 清除缓存
  clearCache: () => {
    userCache = null;
    sessionsCache = null;
    agentsCache = null;
  },

  clearAll: () => {
    localStorage.clear();
    storage.clearCache();
    window.location.reload();
  }
};
