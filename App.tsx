
import React, { useState, useEffect } from 'react';
// 初始化日志系统（自动拦截console和错误）
import './utils/logger';
import { Menu, X, CheckCircle, Users } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Chat from './views/Chat';
import Marketplace from './views/Marketplace';
import Billing from './views/Billing';
import AdminDashboard from './views/AdminDashboard'; 
import OrchestrationStudio from './views/OrchestrationStudio';
import TrendAnalysis from './views/TrendAnalysis';
import ProfileComplete from './views/ProfileComplete';
import XiaohongshuSimulator from './views/XiaohongshuSimulator'; 
import GoalLanding from './views/GoalLanding';
import Auth from './views/Auth';
import AdminLogin from './views/admin/AdminLogin';
import AdminLayout from './views/admin/AdminLayout';
import { MOCK_USER, getWelcomeMessage, MOCK_AGENTS, THEMES, DEFAULT_PROMPT_TEMPLATES } from './constants';
import { AppRoute, AdminRoute, ChatSession, Message, MessageType, Agent, Language, ThemeId, ThemeMode, WorkflowNode, FormField, UserProfileData, ProjectContext, PromptTemplate, AgentSquad } from './types';
import { translations } from './utils/translations';
import { storage } from './utils/storage';
import { api } from './utils/api';
import { handleError } from './utils/errorHandler';

// Helper for unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const App: React.FC = () => {
  // --- Initialization with Persistence ---
  // 检测当前路径，判断是否为管理后台
  const getInitialPath = () => {
    const path = window.location.pathname;
    return {
      isAdmin: path.startsWith('/admin'),
      path: path,
    };
  };

  const initialPath = getInitialPath();
  const [isAdminPath, setIsAdminPath] = useState(initialPath.isAdmin);
  
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(AppRoute.LOGIN);
  
  const [adminRoute, setAdminRoute] = useState<AdminRoute>(() => {
    const path = initialPath.path;
    if (path === '/admin/login') return AdminRoute.LOGIN;
    if (path === '/admin/users') return AdminRoute.USERS;
    if (path === '/admin/agents') return AdminRoute.AGENTS;
    if (path === '/admin/settings') return AdminRoute.SETTINGS;
    if (path.startsWith('/admin')) return AdminRoute.DASHBOARD;
    return AdminRoute.LOGIN;
  });
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Safe Language Initialization
  const [language, setLanguage] = useState<Language>(() => {
      const saved = storage.loadLang();
      return (translations[saved]) ? saved : 'en';
  });

  // Load Agents from storage or fallback to MOCK
  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('1');
  
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>(() => storage.loadTemplates() || DEFAULT_PROMPT_TEMPLATES);
  const [onboardingConfig, setOnboardingConfig] = useState<FormField[]>(() => storage.loadOnboardingConfig() || [
      { id: '1', key: 'industry', label: '所属行业 (Industry)', type: 'select', required: true, options: ['E-commerce (电商)', 'SaaS (软件服务)', 'Education (教育)', 'Healthcare (医疗)', 'Real Estate (房地产)', 'Other (其他)'] },
      { id: '2', key: 'product_name', label: '核心产品名称 (Core Product Name)', type: 'text', required: true, placeholder: '例如：Nexus AI, 戴森吹风机...' },
      { id: '3', key: 'highlights', label: '产品核心卖点/亮点 (Product Highlights)', type: 'textarea', required: true, placeholder: '例如：续航时间长、AI智能降噪、性价比高...' },
      { id: '4', key: 'target_audience', label: '目标客户群体 (Target Audience)', type: 'text', required: false, placeholder: '例如：20-35岁都市白领，注重生活品质...' },
      { id: '5', key: 'documents', label: '产品文档/手册 (Product Documents)', type: 'file', required: false, placeholder: 'Upload PDF, DOCX, TXT...' }
  ]);

  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => storage.loadTheme() || 'blue');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => storage.loadMode() || 'dark');
  const [showTrendAnalysis, setShowTrendAnalysis] = useState(() => storage.loadShowTrendAnalysis());
  const [showSimulator, setShowSimulator] = useState(() => storage.loadShowSimulator()); 
  const [enableStylePrompt, setEnableStylePrompt] = useState(() => storage.loadEnableStylePrompt()); 
  const [showGoalLanding, setShowGoalLanding] = useState(() => storage.loadShowGoalLanding()); // NEW
  
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  // Admin dashboard active tab
  const [adminActiveTab, setAdminActiveTab] = useState<'analytics' | 'users' | 'agents' | 'squads' | 'settings' | 'workflows' | 'onboarding' | 'templates' | 'knowledge' | 'audit'>('analytics');
  
  // UI State for Group Selection
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [squads, setSquads] = useState<AgentSquad[]>(() => storage.loadSquads() || []);
  const [userAvailableSquads, setUserAvailableSquads] = useState<AgentSquad[]>([]);

  // 初始化数据加载（异步）- 检查登录状态
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        
        // 更新 isAdminPath 状态（确保路径变化时正确设置）
        const path = window.location.pathname;
        const isAdmin = path.startsWith('/admin');
        setIsAdminPath(isAdmin);
        
        // 更新 adminRoute（如果是 admin 路径）
        if (isAdmin) {
          if (path === '/admin/login') {
            setAdminRoute(AdminRoute.LOGIN);
          } else if (path === '/admin/users') {
            setAdminRoute(AdminRoute.USERS);
          } else if (path === '/admin/agents') {
            setAdminRoute(AdminRoute.AGENTS);
          } else if (path === '/admin/settings') {
            setAdminRoute(AdminRoute.SETTINGS);
          } else if (path === '/admin' || path === '/admin/') {
            setAdminRoute(AdminRoute.DASHBOARD);
            window.history.replaceState({}, '', '/admin/dashboard');
          } else {
            setAdminRoute(AdminRoute.DASHBOARD);
          }
        }
        
        // 检查是否有 token
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setIsLoading(false);
          return;
        }

        // 如果有 token，尝试获取用户信息
        try {
          const userData = await storage.loadUser();
          if (userData) {
            setCurrentUser(userData);
            
            // 获取当前路径
            const path = window.location.pathname;
            const isAdmin = path.startsWith('/admin');
            
            // 根据路径设置路由
            if (isAdmin) {
              if (userData.role === 'admin') {
                // 管理员在管理后台
                if (path === '/admin/login' || path === '/admin') {
                  setAdminRoute(AdminRoute.DASHBOARD);
                  window.history.replaceState({}, '', '/admin/dashboard');
                }
              } else {
                // 非管理员访问管理后台，重定向到用户端
                window.location.href = '/';
                return;
              }
            } else {
              // 用户端，根据设置跳转
              if (showGoalLanding) {
                setCurrentRoute(AppRoute.HOME);
              } else {
                setCurrentRoute(AppRoute.CHAT);
              }
            }
          }
        } catch (error) {
          // Token 无效，清除并保持登录页
          console.error('Failed to load user:', error);
          localStorage.removeItem('auth_token');
        }
        
        // 并行加载其他数据
        const [agentsData, sessionsData] = await Promise.all([
          storage.loadAgents().catch(() => MOCK_AGENTS),
          storage.loadSessions().catch((error) => {
            console.error('Failed to load sessions from database:', error);
            // 如果加载失败，返回空数组（不使用默认会话，避免覆盖数据库数据）
            return [];
          })
        ]);

        // 确保默认 agent 'a1' 存在（合并 MOCK_AGENTS 中的默认 agent）
        const defaultAgent = MOCK_AGENTS.find(a => a.id === 'a1');
        const hasA1InData = agentsData.find(a => a.id === 'a1');
        let agentsWithDefault = agentsData;
        
        if (defaultAgent && !hasA1InData) {
          // 如果数据库中没有 'a1'，添加默认 agent
          agentsWithDefault = [defaultAgent, ...agentsData];
          console.log('✅ Added default agent a1 to agents list');
        }
        
        console.log('🔍 Loaded agents:', { 
          count: agentsWithDefault.length, 
          hasA1: !!agentsWithDefault.find(a => a.id === 'a1'),
          agentIds: agentsWithDefault.map(a => a.id)
        });
        setAgents(agentsWithDefault);
        setSessions(sessionsData);
        
        // 如果有会话，设置第一个会话为激活会话
        if (sessionsData && sessionsData.length > 0) {
            const firstSessionId = sessionsData[0].id;
            setActiveSessionId(firstSessionId);
            console.log('✅ Loaded sessions from database:', sessionsData.length);
            console.log('✅ Set active session to:', firstSessionId);
            console.log('✅ First session messages:', sessionsData[0].messages?.length || 0);
        } else {
            console.log('⚠️ No sessions found in database');
            // 如果没有会话，保持 activeSessionId 为 '1'（会在后续创建新会话时更新）
            // 或者可以设置为空，让用户创建新会话
        }
      } catch (error) {
        console.error('Failed to load initial data:', error);
        // 使用默认值（但不创建默认会话，避免覆盖数据库数据）
        setAgents(MOCK_AGENTS);
        setSessions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, []); // 只在组件挂载时执行一次

  // --- CLEANUP DEMO SQUADS (Fix for User Issue) ---
  useEffect(() => {
      const loadedSquads = storage.loadSquads() || [];
      const hasDemo = loadedSquads.some(s => s.id.startsWith('sq-demo-'));
      
      if (hasDemo) {
          const cleanSquads = loadedSquads.filter(s => !s.id.startsWith('sq-demo-'));
          storage.saveSquads(cleanSquads);
          setSquads(cleanSquads);
      }
  }, []);

  // --- Persistence Effects ---
  useEffect(() => {
      if (currentUser) storage.saveUser(currentUser);
  }, [currentUser]);

  // 不再自动保存 sessions 到 storage（因为 sessions 现在通过 API 管理）
  // useEffect(() => {
  //     storage.saveSessions(sessions);
  // }, [sessions]);

  useEffect(() => {
      storage.saveAgents(agents);
  }, [agents]);

  // 会话切换时从数据库加载消息
  useEffect(() => {
    if (!activeSessionId || !currentUser) return;

    const loadSessionMessages = async () => {
      if (!activeSessionId) return;
      
      try {
        // 从数据库加载完整会话（包含消息）
        const session = await api.sessions.getById(activeSessionId);
        
        // 更新 sessions 状态中的对应会话
        setSessions(prev => {
          const currentSession = prev.find(s => s.id === activeSessionId);
          
          // 如果当前会话有正在流式更新的消息，保留这些消息
          const streamingMessages = currentSession?.messages?.filter(m => m.isStreaming) || [];
          
          // 合并数据库中的消息和正在流式更新的消息
          const dbMessages = session.messages || [];
          const mergedMessages = [...dbMessages];
          
          // 如果有流式消息，确保它们被保留（替换或追加）
          if (streamingMessages.length > 0) {
            streamingMessages.forEach(streamingMsg => {
              const existingIndex = mergedMessages.findIndex(m => m.id === streamingMsg.id);
              if (existingIndex >= 0) {
                // 如果数据库中有相同ID的消息，但流式消息可能更新，保留流式消息
                mergedMessages[existingIndex] = streamingMsg;
              } else {
                // 如果数据库中没有，追加流式消息
                mergedMessages.push(streamingMsg);
              }
            });
          }
          
          const updated = prev.map(s => 
            s.id === activeSessionId 
              ? { ...s, messages: mergedMessages, lastMessage: session.lastMessage, updatedAt: session.updatedAt }
              : s
          );
          
          // 如果会话不在列表中，添加到列表（可能是新创建的会话）
          const exists = updated.find(s => s.id === activeSessionId);
          if (!exists) {
            return [{ ...session, messages: mergedMessages }, ...prev];
          }
          
          return updated;
        });
      } catch (error: any) {
        // 404 错误是正常的（新创建的会话可能还没有保存到数据库）
        if (error.message?.includes('404') || error.message?.includes('not found')) {
          console.log('Session not found in database (may be new):', activeSessionId);
          return;
        }
        console.error('Failed to load session messages:', error);
      }
    };

    loadSessionMessages();
  }, [activeSessionId, currentUser]);

  useEffect(() => {
      storage.saveTemplates(promptTemplates);
  }, [promptTemplates]);

  useEffect(() => {
      storage.saveOnboardingConfig(onboardingConfig);
  }, [onboardingConfig]);

  useEffect(() => {
      storage.saveTheme(currentTheme);
      storage.saveMode(themeMode);
      storage.saveLang(language);
  }, [currentTheme, themeMode, language]);

  // Reload Squads if they change in Admin
  useEffect(() => {
      const loaded = storage.loadSquads();
      if (loaded) setSquads(loaded);
  }, [currentRoute, isGroupModalOpen]);

  // 监听路径变化
  useEffect(() => {
    const handlePathChange = () => {
      const path = window.location.pathname;
      const isAdmin = path.startsWith('/admin');
      setIsAdminPath(isAdmin);
      
      if (isAdmin) {
        if (path === '/admin/login') {
          setAdminRoute(AdminRoute.LOGIN);
        } else if (path === '/admin/users') {
          setAdminRoute(AdminRoute.USERS);
        } else if (path === '/admin/agents') {
          setAdminRoute(AdminRoute.AGENTS);
        } else if (path === '/admin/settings') {
          setAdminRoute(AdminRoute.SETTINGS);
        } else if (path === '/admin' || path === '/admin/') {
          setAdminRoute(AdminRoute.DASHBOARD);
          // 如果访问 /admin，重定向到 /admin/dashboard
          if (path === '/admin' || path === '/admin/') {
            window.history.replaceState({}, '', '/admin/dashboard');
          }
        } else {
          setAdminRoute(AdminRoute.DASHBOARD);
        }
      }
    };

    // 初始检查
    handlePathChange();
    
    // 监听浏览器前进后退
    window.addEventListener('popstate', handlePathChange);
    
    // 监听 hash 变化（如果需要）
    window.addEventListener('hashchange', handlePathChange);
    
    return () => {
      window.removeEventListener('popstate', handlePathChange);
      window.removeEventListener('hashchange', handlePathChange);
    };
  }, []);

  // Auth check on mount
  useEffect(() => {
      if (currentUser && !isAdminPath) {
          // If Goal Landing is enabled, go there, else go to chat
          if (showGoalLanding) {
              setCurrentRoute(AppRoute.HOME);
          } else {
              setCurrentRoute(AppRoute.CHAT);
          }
      }
  }, [isAdminPath]);

  // --- Handlers ---

  const handleLogin = (user: any) => {
      setCurrentUser(user);
      if (isAdminPath) {
          // 管理员登录后跳转到管理后台
          if (user.role === 'admin') {
              setAdminRoute(AdminRoute.DASHBOARD);
              window.history.pushState({}, '', '/admin/dashboard');
          } else {
              // 非管理员尝试登录管理后台，重定向到用户端
              window.location.href = '/login';
          }
      } else {
          // 普通用户登录
          if (showGoalLanding) {
              setCurrentRoute(AppRoute.HOME);
          } else {
              setCurrentRoute(AppRoute.CHAT);
          }
      }
  };

  const handleAdminLogin = (user: any) => {
      setCurrentUser(user);
      if (user.role === 'admin') {
          setAdminRoute(AdminRoute.DASHBOARD);
          window.history.pushState({}, '', '/admin/dashboard');
      }
  };

  const handleAdminNavigate = (path: string) => {
      setAdminRoute(path as AdminRoute);
      window.history.pushState({}, '', path);
  };

  const handleAdminLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem('auth_token');
      setAdminRoute(AdminRoute.LOGIN);
      window.location.href = '/admin/login';
  };

  const handleLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem('auth_token');
      setCurrentRoute(AppRoute.LOGIN);
      window.location.href = '/login';
  };

  useEffect(() => {
    const root = document.documentElement;
    const theme = THEMES.find(t => t.id === currentTheme);
    if (theme) {
      root.style.setProperty('--color-primary', theme.colors.primary);
      root.style.setProperty('--color-primary-hover', theme.colors.primaryHover);
      root.style.setProperty('--color-accent', theme.colors.accent);
    }
    if (themeMode === 'light') {
        root.style.setProperty('--color-background', '#f8fafc'); 
        root.style.setProperty('--color-surface', '#ffffff');    
        root.style.setProperty('--color-border', '#e2e8f0');     
        root.style.setProperty('--color-text-main', '#0f172a');  
        root.style.setProperty('--color-text-secondary', '#64748b'); 
    } else {
        root.style.setProperty('--color-background', '#0f172a'); 
        root.style.setProperty('--color-surface', '#1e293b');    
        root.style.setProperty('--color-border', '#334155');     
        root.style.setProperty('--color-text-main', '#f8fafc');  
        root.style.setProperty('--color-text-secondary', '#94a3b8'); 
    }
  }, [currentTheme, themeMode]);

  const activeSession = sessions && sessions.length > 0 
    ? (sessions.find(s => s.id === activeSessionId) || sessions[0])
    : null;
  
  const updateMessages = (newMessages: React.SetStateAction<Message[]>) => {
    setSessions(prev => prev.map(session => {
        if (session.id === activeSessionId) {
            const updatedMsgs = typeof newMessages === 'function' ? newMessages(session.messages) : newMessages;
            const lastMsg = updatedMsgs[updatedMsgs.length - 1];
            return {
                ...session,
                messages: updatedMsgs,
                lastMessage: lastMsg?.content.substring(0, 30) + '...' || session.lastMessage
            };
        }
        return session;
    }));
  };

  const createNewSession = async () => {
    console.log('🆕 createNewSession called');
    const tempId = generateId();
    const t = translations[language]?.common || translations['en'].common;
    
    // 乐观更新：立即显示新会话
    const newSession: ChatSession = {
        id: tempId,
        title: t.newChat,
        lastMessage: '',
        updatedAt: Date.now(),
        messages: [{ id: `init-${tempId}`, type: MessageType.AGENT, content: getWelcomeMessage(language), senderId: 'a1', timestamp: Date.now(), senderName: 'Nexus' }],
        isGroup: false,
        participants: ['a1']
    };
    console.log('📝 Creating temporary session with ID:', tempId);
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(tempId);
    setCurrentRoute(AppRoute.CHAT);

    // 保存到数据库
    try {
        console.log('📝 Creating session in database with tempId:', tempId);
        const savedSession = await api.sessions.create({
            title: t.newChat,
            isGroup: false,
            participants: ['a1']
        });
        console.log('✅ Session created in database:', savedSession.id);
        
        // 更新为数据库返回的 ID
        setSessions(prev => prev.map(s => 
            s.id === tempId ? { ...s, id: savedSession.id, updatedAt: savedSession.updatedAt } : s
        ));
        console.log('🔄 Updating activeSessionId from', tempId, 'to', savedSession.id);
        setActiveSessionId(savedSession.id);
        
        // 确保会话已保存，等待一小段时间让状态更新
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('✅ Session state updated, activeSessionId should now be:', savedSession.id);
    } catch (error: any) {
        // 回滚：移除临时会话
        console.error('❌ Failed to create session:', error);
        console.error('❌ Error details:', error.message, error);
        setSessions(prev => prev.filter(s => s.id !== tempId));
        if (activeSessionId === tempId) {
            console.log('🔄 Clearing activeSessionId because session creation failed');
            setActiveSessionId('');
            // 如果有其他会话，切换到第一个
            setSessions(prev => {
                if (prev.length > 0) {
                    setActiveSessionId(prev[0].id);
                }
                return prev;
            });
        }
        alert(language === 'zh' ? `创建会话失败：${error.message || '未知错误'}，请稍后重试` : `Failed to create session: ${error.message || 'Unknown error'}, please try again`);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      // 调用后端 API 删除会话
      await api.sessions.delete(sessionId);
      
      // 从状态中移除会话
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      // 如果删除的是当前激活的会话，切换到其他会话或创建新会话
      if (activeSessionId === sessionId) {
        const remainingSessions = sessions.filter(s => s.id !== sessionId);
        if (remainingSessions.length > 0) {
          setActiveSessionId(remainingSessions[0].id);
        } else {
          // 如果没有其他会话，创建新会话
          await createNewSession();
        }
      }
    } catch (error: any) {
      console.error('Failed to delete session:', error);
      alert(language === 'zh' ? '删除会话失败，请稍后重试' : 'Failed to delete session, please try again');
    }
  };

  const createGroupSessionFromSquad = async (squad: AgentSquad) => {
      const existingSession = sessions.find(s => s.isGroup && s.title === squad.name);
      
      if (existingSession) {
          setActiveSessionId(existingSession.id);
          setCurrentRoute(AppRoute.CHAT);
          return;
      }

      const tempId = generateId();
      const welcomeMessage = language === 'zh' 
        ? "群聊已建立。我是统筹助手，请直接告诉我您的需求，或使用 @ 提及群内专家。" 
        : "Group chat created. I am the Orchestrator. Tell me your goal, or @mention experts in this group.";
      
      // 乐观更新：立即显示新会话
      const newSession: ChatSession = {
          id: tempId,
          title: squad.name,
          lastMessage: '',
          updatedAt: Date.now(),
          messages: [{ 
              id: `init-${tempId}`, 
              type: MessageType.AGENT, 
              content: welcomeMessage,
              senderId: 'a1', 
              timestamp: Date.now(), 
              senderName: language === 'zh' ? '统筹助手' : 'Nexus' 
          }],
          isGroup: true,
          participants: squad.memberAgentIds
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(tempId);
      setCurrentRoute(AppRoute.CHAT);

      // 保存到数据库
      try {
          const savedSession = await api.sessions.create({
              title: squad.name,
              isGroup: true,
              participants: squad.memberAgentIds
          });
          
          // 更新为数据库返回的 ID
          setSessions(prev => prev.map(s => 
              s.id === tempId ? { ...s, id: savedSession.id, updatedAt: savedSession.updatedAt } : s
          ));
          setActiveSessionId(savedSession.id);
      } catch (error: any) {
          // 回滚：移除临时会话
          setSessions(prev => prev.filter(s => s.id !== tempId));
          console.error('Failed to create group session:', error);
          alert(language === 'zh' ? '创建群聊失败，请稍后重试' : 'Failed to create group session, please try again');
      }
  };

  // NEW: Handle Goal from Landing Page
  const handleGoalSubmit = async (title: string, agentIds: string[], initialPlan: string) => {
      const tempId = generateId();
      
      // 乐观更新：立即显示新会话
      const newSession: ChatSession = {
          id: tempId,
          title: title,
          lastMessage: 'Plan Generated',
          updatedAt: Date.now(),
          messages: [
              { 
                  id: `init-${tempId}`, 
                  type: MessageType.AGENT, 
                  content: initialPlan,
                  senderId: 'a1', 
                  timestamp: Date.now(), 
                  senderName: language === 'zh' ? '统筹助手' : 'Nexus'
              }
          ],
          isGroup: true,
          participants: agentIds
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(tempId);
      setCurrentRoute(AppRoute.CHAT);

      // 保存到数据库
      try {
          const savedSession = await api.sessions.create({
              title: title,
              isGroup: true,
              participants: agentIds
          });
          
          // 更新为数据库返回的 ID
          setSessions(prev => prev.map(s => 
              s.id === tempId ? { ...s, id: savedSession.id, updatedAt: savedSession.updatedAt } : s
          ));
          setActiveSessionId(savedSession.id);
      } catch (error: any) {
          // 回滚：移除临时会话
          setSessions(prev => prev.filter(s => s.id !== tempId));
          console.error('Failed to create goal session:', error);
          alert(language === 'zh' ? '创建会话失败，请稍后重试' : 'Failed to create session, please try again');
      }
  };

  const handleInitGroupChat = () => {
      const latestSquads = storage.loadSquads() || [];
      const validSquads = latestSquads.filter(s => !s.id.startsWith('sq-demo-'));
      setSquads(validSquads); 

      const mySquads = validSquads.filter(s => s.assignedToUserIds?.includes(currentUser?.id || ''));
      
      if (mySquads.length > 0) {
          if (mySquads.length === 1) {
              createGroupSessionFromSquad(mySquads[0]);
          } else {
              setUserAvailableSquads(mySquads);
              setIsGroupModalOpen(true);
          }
      } else {
          const msg = language === 'zh'
            ? translations['zh']?.common.noSquadsAlert 
            : "You are not assigned to any squads. Please contact the administrator.";
          alert(msg || "You are not assigned to any squads. Please contact the administrator.");
      }
  };

  const handleSelectAgentFromMarketplace = (agent: Agent) => {
      const newId = generateId();
      const newSession: ChatSession = {
          id: newId,
          title: agent.name,
          lastMessage: '',
          updatedAt: Date.now(),
          messages: [{ 
              id: `init-${newId}`, 
              type: MessageType.AGENT, 
              content: language === 'zh' ? `你好，我是${agent.name}。` : `Hello, I am ${agent.name}. How can I assist you?`,
              senderId: agent.id, 
              timestamp: Date.now(), 
              senderName: agent.name,
              senderAvatar: agent.avatar
          }],
          isGroup: false,
          participants: [agent.id]
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newId);
      setCurrentRoute(AppRoute.CHAT);
  };

  const handleStartPrivateChat = (agentId: string) => {
      const agent = agents.find(a => a.id === agentId); // Use local agents state
      if (!agent) return;

      const existingSession = sessions.find(s => !s.isGroup && s.participants?.length === 1 && s.participants[0] === agentId);
      
      if (existingSession) {
          setActiveSessionId(existingSession.id);
          setCurrentRoute(AppRoute.CHAT);
      } else {
          handleSelectAgentFromMarketplace(agent);
      }
  };

  const handleDeployWorkflow = (nodes: WorkflowNode[]) => {
      const newId = generateId();
      const agentsInFlow = nodes.filter(n => n.type === 'agent' && n.data.agentId).map(n => n.data.agentId!);
      const uniqueAgents = Array.from(new Set(agentsInFlow));
      
      const title = language === 'zh' ? '自定义编排工作流' : 'Custom Orchestration Flow';
      const agentNames = nodes.filter(n => n.type === 'agent').map(n => n.data.label).join(', ');

      const newSession: ChatSession = {
          id: newId,
          title: title,
          lastMessage: 'Workflow deployed',
          updatedAt: Date.now(),
          messages: [{
              id: `sys-${newId}`,
              type: MessageType.SYSTEM_INFO,
              content: language === 'zh' 
                ? `工作流已部署。参与智能体: ${agentNames}`
                : `Workflow Deployed. Participating Agents: ${agentNames}`,
              senderId: 'system',
              timestamp: Date.now()
          }],
          isGroup: true,
          participants: uniqueAgents
      };

      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newId);
      setCurrentRoute(AppRoute.CHAT);
  };

  const handleProfileComplete = (data: UserProfileData) => {
      if (showGoalLanding) {
          setCurrentRoute(AppRoute.HOME);
      } else {
          setCurrentRoute(AppRoute.CHAT);
      }
  };

  const handleUpdateProjects = async (projects: ProjectContext[], activeId: string) => {
      // 乐观更新：立即更新前端状态
      setCurrentUser(prev => prev ? ({
          ...prev,
          projects: projects,
          activeProjectId: activeId
      }) : null);

      // 保存到数据库
      try {
          // 更新用户的 activeProjectId
          await api.users.updateMe({ activeProjectId: activeId });
          
          // 同步所有项目到数据库
          const previousProjects = currentUser?.projects || [];
          const updatedProjects = [...projects];
          let finalActiveId = activeId;
          
          // 找出新增的项目（在前端存在但在数据库可能不存在）
          for (let i = 0; i < projects.length; i++) {
              const project = projects[i];
              const previousProject = previousProjects.find(p => p.id === project.id);
              
              // 如果是新项目（不在 previousProjects 中），直接创建
              if (!previousProject) {
                  try {
                      const createdProject = await api.projects.create({
                          name: project.name,
                          description: project.description,
                          data: project.data
                      });
                      
                      // 使用后端返回的 ID 更新项目
                      updatedProjects[i] = {
                          ...project,
                          id: createdProject.id,
                          updatedAt: createdProject.updatedAt
                      };
                      
                      // 如果这是激活的项目，更新 activeId
                      if (project.id === activeId) {
                          finalActiveId = createdProject.id;
                      }
                  } catch (createError: any) {
                      console.error(`Failed to create project ${project.id}:`, createError);
                      handleError(createError, {
                          action: 'create project',
                          component: 'App',
                          userId: currentUser?.id
                      });
                  }
              } else {
                  // 如果是已存在的项目，检查是否有变化
                  if (previousProject.name !== project.name ||
                      previousProject.description !== project.description ||
                      JSON.stringify(previousProject.data) !== JSON.stringify(project.data)) {
                      try {
                          const updatedProject = await api.projects.update(project.id, {
                              name: project.name,
                              description: project.description,
                              data: project.data
                          });
                          
                          // 更新项目信息
                          updatedProjects[i] = {
                              ...project,
                              updatedAt: updatedProject.updatedAt
                          };
                      } catch (error: any) {
                          console.error(`Failed to update project ${project.id}:`, error);
                          handleError(error, {
                              action: 'update project',
                              component: 'App',
                              userId: currentUser?.id
                          });
                      }
                  }
              }
          }
          
          // 如果有项目 ID 变化，更新前端状态
          if (finalActiveId !== activeId || JSON.stringify(updatedProjects) !== JSON.stringify(projects)) {
              setCurrentUser(prev => prev ? ({
                  ...prev,
                  projects: updatedProjects,
                  activeProjectId: finalActiveId
              }) : null);
          }
          
          // 找出被删除的项目（在数据库存在但在前端不存在）
          for (const previousProject of previousProjects) {
              const exists = projects.find(p => p.id === previousProject.id);
              if (!exists) {
                  try {
                      await api.projects.delete(previousProject.id);
                  } catch (error) {
                      console.error(`Failed to delete project ${previousProject.id}:`, error);
                  }
              }
          }
      } catch (error: any) {
          console.error('Failed to save projects:', error);
          handleError(error, {
              action: 'save projects',
              component: 'App',
              userId: currentUser?.id
          });
      }
  };

  const handleUpdateProjectData = async (projectId: string, newData: UserProfileData) => {
      // 乐观更新：立即更新前端状态
      setCurrentUser(prev => {
          if (!prev) return null;
          const updatedProjects = prev.projects.map(p => 
              p.id === projectId ? { ...p, data: newData, updatedAt: Date.now() } : p
          );
          return { ...prev, projects: updatedProjects };
      });

      // 保存到数据库
      try {
          const project = currentUser?.projects.find(p => p.id === projectId);
          if (project) {
              await api.projects.update(projectId, {
                  data: newData
              });
          }
      } catch (error: any) {
          console.error('Failed to save project data:', error);
          // 如果项目不存在，尝试创建
          if (error.status === 404) {
              try {
                  const project = currentUser?.projects.find(p => p.id === projectId);
                  if (project) {
                      await api.projects.create({
                          name: project.name,
                          description: project.description,
                          data: newData
                      });
                  }
              } catch (createError) {
                  console.error('Failed to create project:', createError);
              }
          }
      }
  };

  const handleProfileCancel = () => {
      if (showGoalLanding) {
          setCurrentRoute(AppRoute.HOME);
      } else {
          setCurrentRoute(AppRoute.CHAT);
      }
  };

  const GroupSelectionModal = () => {
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
              <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
                  <div className="p-5 border-b border-border flex justify-between items-center">
                      <h3 className="text-xl font-bold text-textMain">{language === 'zh' ? '选择群组' : 'Select Team Squad'}</h3>
                      <button onClick={() => setIsGroupModalOpen(false)}><X size={24} className="text-textSecondary hover:text-textMain"/></button>
                  </div>
                  <div className="p-6 space-y-3">
                      <p className="text-sm text-textSecondary mb-4">
                        {language === 'zh' ? '您有多个可用群组，请选择一个进入：' : 'You have multiple assigned squads. Please select one to enter:'}
                      </p>
                      {userAvailableSquads.map(sq => (
                          <button
                            key={sq.id}
                            onClick={() => {
                                createGroupSessionFromSquad(sq);
                                setIsGroupModalOpen(false);
                            }}
                            className="w-full text-left p-4 rounded-xl border border-border bg-background hover:border-primary/50 hover:shadow-md transition-all group"
                          >
                              <div className="flex items-center justify-between mb-1">
                                  <h4 className="font-bold text-textMain group-hover:text-primary transition-colors">{sq.name}</h4>
                                  <span className="text-[10px] bg-surface px-2 py-0.5 rounded border border-border">{sq.memberAgentIds.length} Agents</span>
                              </div>
                              <p className="text-xs text-textSecondary line-clamp-1">{sq.description}</p>
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      );
  };

  // 管理后台路由处理
  if (isAdminPath) {
      // 管理后台登录页面（优先检查，即使正在加载也显示登录页）
      if (adminRoute === AdminRoute.LOGIN || !currentUser) {
          // 如果正在加载，显示加载状态（但如果是登录页，直接显示登录页）
          if (isLoading && adminRoute !== AdminRoute.LOGIN) {
              return (
                  <div className="h-screen flex items-center justify-center bg-background">
                      <div className="text-center">
                          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                          <p className="text-textSecondary">{language === 'zh' ? '加载中...' : 'Loading...'}</p>
                      </div>
                  </div>
              );
          }
          return <AdminLogin onLogin={handleAdminLogin} language={language} />;
      }
      
      // 如果正在加载，显示加载状态
      if (isLoading) {
          return (
              <div className="h-screen flex items-center justify-center bg-background">
                  <div className="text-center">
                      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-textSecondary">{language === 'zh' ? '加载中...' : 'Loading...'}</p>
                  </div>
              </div>
          );
      }
      
      // 检查是否为管理员
      if (currentUser.role !== 'admin') {
          // 非管理员访问管理后台，重定向到用户端
          window.location.href = '/login';
          return null;
      }
      
      // 管理后台内容
      return (
          <AdminLayout
              currentUser={currentUser}
              language={language}
              currentPath={window.location.pathname}
              onNavigate={handleAdminNavigate}
              onLogout={handleAdminLogout}
              activeTab={adminActiveTab}
              onTabChange={setAdminActiveTab}
          >
              {adminRoute === AdminRoute.DASHBOARD && (
                  <AdminDashboard 
                      language={language} 
                      onboardingConfig={onboardingConfig} 
                      onUpdateOnboardingConfig={setOnboardingConfig} 
                      promptTemplates={promptTemplates}
                      onUpdatePromptTemplates={setPromptTemplates}
                      onToggleTrendAnalysis={setShowTrendAnalysis}
                      onToggleSimulator={setShowSimulator} 
                      onToggleStylePrompt={setEnableStylePrompt} 
                      onToggleGoalLanding={setShowGoalLanding}
                      agents={agents}
                      onUpdateAgents={setAgents}
                      activeTab={adminActiveTab}
                  />
              )}
              {adminRoute === AdminRoute.USERS && (
                  <div className="p-6">
                      <h1 className="text-2xl font-bold mb-4">{language === 'zh' ? '用户管理' : 'User Management'}</h1>
                      {/* 用户管理组件将在后续实现 */}
                  </div>
              )}
              {adminRoute === AdminRoute.AGENTS && (
                  <div className="p-6">
                      <h1 className="text-2xl font-bold mb-4">{language === 'zh' ? '智能体管理' : 'Agent Management'}</h1>
                      {/* 智能体管理组件将在后续实现 */}
                  </div>
              )}
              {adminRoute === AdminRoute.SETTINGS && (
                  <div className="p-6">
                      <h1 className="text-2xl font-bold mb-4">{language === 'zh' ? '系统设置' : 'System Settings'}</h1>
                      {/* 系统设置组件将在后续实现 */}
                  </div>
              )}
          </AdminLayout>
      );
  }

  // 用户端路由处理
  // 如果正在加载，显示加载状态
  if (isLoading) {
      return (
          <div className="h-screen flex items-center justify-center bg-background">
              <div className="text-center">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-textSecondary">{language === 'zh' ? '加载中...' : 'Loading...'}</p>
              </div>
          </div>
      );
  }
  
  // 如果未登录或当前路由是登录页，显示登录页面
  if (!currentUser || currentRoute === AppRoute.LOGIN) {
      return <Auth onLogin={handleLogin} language={language} />;
  }

  const renderContent = () => {
    switch (currentRoute) {
      case AppRoute.HOME: // NEW
          return (
            <GoalLanding 
                language={language}
                agents={agents}
                onGoalSubmit={handleGoalSubmit}
            />
          );
      case AppRoute.CONTEXT_MANAGER: 
          return (
            <ProfileComplete 
                user={currentUser} 
                formConfig={onboardingConfig} 
                onComplete={handleProfileComplete} 
                onCancel={handleProfileCancel}
                language={language}
                onUpdateProjects={handleUpdateProjects}
            />
          );
      case AppRoute.CHAT:
        if (!activeSession) {
          return (
            <div className="h-screen flex items-center justify-center">
              <p className="text-textSecondary">{language === 'zh' ? '加载会话中...' : 'Loading session...'}</p>
            </div>
          );
        }
        return (
          <Chat 
            user={currentUser}
            activeSession={activeSession}
            messages={activeSession.messages || []}
            setMessages={updateMessages}
            onUpdateCredits={(c) => setCurrentUser(prev => prev ? ({...prev, credits: c}) : null)}
            activeSessionId={activeSessionId}
            language={language}
            promptTemplates={promptTemplates}
            onUpdateProjectData={handleUpdateProjectData}
            onStartPrivateChat={handleStartPrivateChat}
            onSessionCreated={async (newSessionId) => {
              // 当Chat组件自动创建会话后，更新App的状态
              console.log('🔄 Updating session ID from Chat:', newSessionId);
              setActiveSessionId(newSessionId);
              // 重新加载会话列表以获取新会话
              try {
                const sessionsData = await api.sessions.getAll();
                const updatedSessions = sessionsData.map((s: any) => ({
                  id: s.id,
                  title: s.title,
                  lastMessage: s.lastMessage || '',
                  updatedAt: s.updatedAt,
                  messages: [],
                  isGroup: s.isGroup,
                  participants: s.participants || []
                }));
                setSessions(updatedSessions);
                // 找到新创建的会话并设置为active
                const newSession = updatedSessions.find((s: ChatSession) => s.id === newSessionId);
                if (newSession) {
                  // 加载新会话的消息
                  try {
                    const sessionMessagesResponse = await api.messages.getBySession(newSessionId);
                    // API 返回格式为 { messages: [...], pagination: {...} }
                    const messages = sessionMessagesResponse?.messages || [];
                    newSession.messages = messages.map((m: any) => ({
                      id: m.id,
                      type: m.type as MessageType,
                      content: m.content,
                      senderId: m.senderId,
                      senderName: m.senderName,
                      senderAvatar: m.senderAvatar,
                      timestamp: m.timestamp,
                      isStreaming: false
                    }));
                    setSessions(prev => prev.map(s => s.id === newSessionId ? newSession : s));
                  } catch (e) {
                    console.error('Failed to load new session messages:', e);
                  }
                }
              } catch (e) {
                console.error('Failed to reload sessions:', e);
              }
            }} 
            agents={agents} // Pass Global Agents
            enableStylePrompt={enableStylePrompt} // PASS SETTING TO CHAT
            showSimulator={showSimulator} // PASS SIMULATOR TOGGLE
          />
        );
      case AppRoute.AGENTS:
        return <Marketplace 
            onSelectAgent={handleSelectAgentFromMarketplace} 
            onNavigate={setCurrentRoute} 
            language={language} 
            agents={agents} // Pass Global Agents
        />;
      case AppRoute.BILLING:
        return <Billing user={currentUser} language={language} />;
      case AppRoute.TRENDS:
        return <TrendAnalysis language={language} />;
      case AppRoute.SIMULATOR: 
        return <XiaohongshuSimulator language={language} user={currentUser} />;
      case AppRoute.ADMIN: 
        return <AdminDashboard 
            language={language} 
            onboardingConfig={onboardingConfig} 
            onUpdateOnboardingConfig={setOnboardingConfig} 
            promptTemplates={promptTemplates}
            onUpdatePromptTemplates={setPromptTemplates}
            onToggleTrendAnalysis={setShowTrendAnalysis}
            onToggleSimulator={setShowSimulator} 
            onToggleStylePrompt={setEnableStylePrompt} 
            onToggleGoalLanding={setShowGoalLanding} // NEW
            agents={agents} // Pass Global Agents
            onUpdateAgents={setAgents} // Allow Admin to update
        />;
      case AppRoute.STUDIO:
        return <OrchestrationStudio language={language} onDeploy={handleDeployWorkflow} onBack={() => setCurrentRoute(AppRoute.ADMIN)} />;
      default:
        return null;
    }
  };

  if (currentRoute === AppRoute.CONTEXT_MANAGER) {
      return (
        <div className="h-screen bg-background overflow-hidden text-textMain font-sans transition-colors duration-300">
             {renderContent()}
        </div>
      );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden text-textMain font-sans selection:bg-primary/30 transition-colors duration-300">
      
      {isGroupModalOpen && <GroupSelectionModal />}

      <Sidebar 
        currentUser={currentUser}
        currentRoute={currentRoute}
        onNavigate={setCurrentRoute}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onCreateSession={createNewSession}
        onCreateGroupSession={handleInitGroupChat}
        onDeleteSession={handleDeleteSession} 
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        language={language}
        setLanguage={setLanguage}
        currentTheme={currentTheme}
        setTheme={setCurrentTheme}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        onUpdateProject={(id) => setCurrentUser(u => u ? ({...u, activeProjectId: id}) : null)}
        showTrendAnalysis={showTrendAnalysis}
        showSimulator={showSimulator} 
        showGoalLanding={showGoalLanding} // NEW
        onLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col relative md:ml-72 h-full transition-all duration-200">
        
        <div className="md:hidden absolute top-4 left-4 z-40">
            <button 
                onClick={() => setIsMobileOpen(true)}
                className="p-2 bg-surface text-textMain rounded-lg shadow-lg border border-border transition-colors"
            >
                <Menu size={20} />
            </button>
        </div>

        {renderContent()}
      </main>
    </div>
  );
};

export default App;
