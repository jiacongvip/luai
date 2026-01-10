// API 客户端配置
// 自动检测环境：生产环境使用后端服务地址，开发环境使用 localhost
const getApiBaseUrl = () => {
  // 如果设置了环境变量且不为空，优先使用
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.length > 0) {
    return envUrl;
  }
  
  // 生产环境检测：非 localhost 域名
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // Railway 或其他生产环境
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // Railway 部署：使用后端服务地址
      return 'https://luai-production.up.railway.app/api';
    }
  }
  
  // 开发环境
  return 'http://localhost:3001/api';
};

const API_BASE_URL = getApiBaseUrl();
console.log('🔗 API Base URL:', API_BASE_URL);

// 延迟导入logger，避免循环依赖
let logger: any = null;
const getLogger = () => {
  if (!logger) {
    import('./logger').then(module => {
      logger = module.logger;
    });
  }
  return logger;
};

// 获取认证 token
const getToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

// 设置认证 token
export const setAuthToken = (token: string) => {
  localStorage.setItem('auth_token', token);
};

// 清除认证 token
export const clearAuthToken = () => {
  localStorage.removeItem('auth_token');
};

// 通用 API 请求函数
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const method = options.method || 'GET';
  const url = `${API_BASE_URL}${endpoint}`;
  
  // 记录API调用
  const loggerInstance = getLogger();
  if (loggerInstance) {
    loggerInstance.logAPI(method, url);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token 过期，清除 token
      clearAuthToken();
      
      // 只有在非登录页面时才跳转，避免循环跳转
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/login') && !currentPath.includes('/admin/login')) {
        // 延迟跳转，避免在初始化时立即跳转导致错误提示
        setTimeout(() => {
          if (currentPath.startsWith('/admin')) {
            window.location.href = '/admin/login';
          } else {
      window.location.href = '/login';
          }
        }, 100);
      }
      
      const error: any = new Error('Unauthorized');
      error.status = 401;
      if (loggerInstance) {
        loggerInstance.logError(undefined, 'Unauthorized API request', { method, url, status: 401 });
      }
      throw error;
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    const errorMessage = error.error || `HTTP ${response.status}`;
    if (loggerInstance) {
      loggerInstance.logAPI(method, url, response.status, errorMessage);
      loggerInstance.logError(undefined, `API Error: ${errorMessage}`, { method, url, status: response.status, error });
    }
    const err: any = new Error(errorMessage);
    err.status = response.status;
    err.data = error;
    throw err;
  }

  // 记录成功的API调用
  if (loggerInstance) {
    loggerInstance.logAPI(method, url, response.status);
  }

  return response.json();
}

// API 方法
export const api = {
  // 认证
  auth: {
    login: async (email: string, password: string) => {
      // 收集localStorage设置用于迁移到数据库
      const localPreferences = {
        theme: localStorage.getItem('nexus_theme_v1'),
        mode: localStorage.getItem('nexus_mode_v1'),
        language: localStorage.getItem('nexus_lang_v1'),
        modelName: localStorage.getItem('nexus_model_name_v1'),
        showContextDrawer: localStorage.getItem('nexus_show_context_drawer_v1') === 'true',
        showThoughtChain: localStorage.getItem('nexus_show_thought_chain_v1') !== 'false',
        showFollowUps: localStorage.getItem('nexus_show_follow_ups_v1') !== 'false',
        showRichActions: localStorage.getItem('nexus_show_rich_actions_v1') !== 'false',
        showTrendAnalysis: localStorage.getItem('nexus_show_trend_analysis_v1') !== 'false',
        showSimulator: localStorage.getItem('nexus_show_simulator_v1') !== 'false',
        enableStylePrompt: localStorage.getItem('nexus_enable_style_prompt_v1') !== 'false',
        showGoalLanding: localStorage.getItem('nexus_show_goal_landing_v1') === 'true',
        enableWebSocket: localStorage.getItem('nexus_enable_websocket_v1') === 'true',
        allowModelSelect: localStorage.getItem('nexus_allow_model_select_v1') !== 'false',
      };
      
      const data = await apiRequest<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, localPreferences }),
      });
      if (data.token) {
        setAuthToken(data.token);
      }
      return data;
    },
    register: async (email: string, password: string, name: string) => {
      const data = await apiRequest<{ token: string; user: any }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      });
      if (data.token) {
        setAuthToken(data.token);
      }
      return data;
    },
    getMe: () => apiRequest<any>('/auth/me'),
  },

  // 用户
  users: {
    getMe: () => apiRequest<any>('/users/me'),
    updateMe: (data: any) =>
      apiRequest<any>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  // 会话
  sessions: {
    getAll: () => apiRequest<any[]>('/sessions'),
    getById: (id: string) => apiRequest<any>(`/sessions/${id}`),
    create: (data: any) =>
      apiRequest<any>('/sessions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiRequest<any>(`/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiRequest<any>(`/sessions/${id}`, {
        method: 'DELETE',
      }),
  },

  // 消息
  messages: {
    getBySession: (sessionId: string, options?: { limit?: number; before?: number; after?: number }) => {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.before) params.append('before', options.before.toString());
      if (options?.after) params.append('after', options.after.toString());
      const queryString = params.toString();
      return apiRequest<{ messages: any[]; pagination: any }>(`/messages/session/${sessionId}${queryString ? `?${queryString}` : ''}`);
    },
    send: async (sessionId: string, content: string, options: any = {}) => {
      // 流式响应处理
      console.log('📤 api.messages.send called:', { sessionId, contentLength: content.length, options });
      const token = getToken();
      if (!token) {
        console.error('❌ No auth token found!');
        throw new Error('No authentication token');
      }
      
      console.log('📡 Fetching:', `${API_BASE_URL}/messages/send`);
      const response = await fetch(`${API_BASE_URL}/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          content,
          ...options,
        }),
      });

      console.log('📥 Response status:', response.status, response.ok);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return response;
    },
    updateFeedback: (messageId: string, feedback: 'like' | 'dislike') =>
      apiRequest<any>(`/messages/${messageId}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({ feedback }),
      }),
  },

  // 智能体
  agents: {
    getAll: () => apiRequest<any[]>('/agents'),
    getById: (id: string) => apiRequest<any>(`/agents/${id}`),
    create: (data: any) =>
      apiRequest<any>('/agents', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiRequest<any>(`/agents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiRequest<any>(`/agents/${id}`, {
        method: 'DELETE',
      }),
    // Agent workflow graph (Coze-like builder)
    getWorkflow: (id: string) => apiRequest<any>(`/agents/${id}/workflow`),
    updateWorkflow: (id: string, data: { nodes: any[]; edges: any[] }) =>
      apiRequest<any>(`/agents/${id}/workflow`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  // 项目（上下文）
  projects: {
    getAll: () => apiRequest<any[]>('/projects'),
    create: (data: { name: string; description?: string; data?: any }) =>
      apiRequest<any>('/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { name?: string; description?: string; data?: any }) =>
      apiRequest<any>(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiRequest<any>(`/projects/${id}`, {
        method: 'DELETE',
      }),
  },

  // 管理后台 API
  admin: {
    // 统计信息
    getStats: () => apiRequest<any>('/admin/stats'),
    
    // 用户管理
    getUsers: (params?: { page?: number; limit?: number; search?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      if (params?.search) query.append('search', params.search);
      const queryString = query.toString();
      return apiRequest<any>(`/admin/users${queryString ? `?${queryString}` : ''}`);
    },
    updateUser: (id: string, data: any) =>
      apiRequest<any>(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteUser: (id: string) =>
      apiRequest<any>(`/admin/users/${id}`, {
        method: 'DELETE',
      }),
    
    // 智能体管理（包括私有）
    getAllAgents: () => apiRequest<any[]>('/admin/agents'),

    // 一键发布当前管理员创建的所有智能体（让用户端可见）
    publishAllAgents: () =>
      apiRequest<{ success: boolean; updated: number }>('/admin/agents/publish-all', {
        method: 'POST',
      }),
    
    // 系统设置
    getSettings: () => apiRequest<any>('/admin/settings'),
    updateSettings: (key: string, value: any, description?: string) =>
      apiRequest<any>('/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ key, value, description }),
      }),
  },

  // 群组
  squads: {
    getAll: () => apiRequest<any[]>('/squads'),
    create: (data: any) =>
      apiRequest<any>('/squads', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiRequest<any>(`/squads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiRequest<any>(`/squads/${id}`, {
        method: 'DELETE',
      }),
  },

  // 提示模板
  promptTemplates: {
    getAll: () => apiRequest<any[]>('/prompt-templates'),
    create: (data: any) =>
      apiRequest<any>('/prompt-templates', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiRequest<any>(`/prompt-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiRequest<any>(`/prompt-templates/${id}`, {
        method: 'DELETE',
      }),
  },

  // 工作流
  workflows: {
    getAll: () => apiRequest<any[]>('/workflows'),
    create: (data: any) =>
      apiRequest<any>('/workflows', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiRequest<any>(`/workflows/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiRequest<any>(`/workflows/${id}`, {
        method: 'DELETE',
      }),
  },

  // ============================================
  // 计费系统
  // ============================================
  billing: {
    // 获取余额和订阅信息
    getBalance: () => apiRequest<{ credits: number; subscription: any }>('/billing/balance'),
    
    // 获取交易记录
    getTransactions: (params?: { page?: number; limit?: number; type?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      if (params?.type) query.append('type', params.type);
      const queryString = query.toString();
      return apiRequest<any>(`/billing/transactions${queryString ? `?${queryString}` : ''}`);
    },
    
    // 获取使用统计
    getUsage: (period?: '7d' | '30d' | '90d') =>
      apiRequest<any>(`/billing/usage${period ? `?period=${period}` : ''}`),
    
    // 获取定价方案
    getPlans: () => apiRequest<any[]>('/billing/plans'),
    
    // 创建充值订单
    createRecharge: (data: { planId?: string; paymentMethod: string; amount: number; credits: number }) =>
      apiRequest<{ success: boolean; orderId: string; paymentInfo: any }>('/billing/recharge', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    
    // 模拟支付（仅开发环境）
    simulatePayment: (orderId: string) =>
      apiRequest<{ success: boolean; newBalance: number }>('/billing/simulate-payment', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      }),
    
    // 订阅
    subscribe: (planId: string, paymentMethod: string, confirmToken?: string) => {
      const headers: any = {};
      if (confirmToken) headers['X-Confirm-Token'] = confirmToken;
      return apiRequest<any>('/billing/subscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({ planId, paymentMethod }),
      });
    },
    
    // 取消订阅
    cancelSubscription: (confirmToken?: string) => {
      const headers: any = {};
      if (confirmToken) headers['X-Confirm-Token'] = confirmToken;
      return apiRequest<any>('/billing/cancel-subscription', {
        method: 'POST',
        headers,
      });
    },
  },

  // ============================================
  // 监控和分析
  // ============================================
  analytics: {
    // 用户使用仪表板
    getDashboard: () => apiRequest<any>('/analytics/dashboard'),
    
    // 管理员系统概览
    getAdminOverview: () => apiRequest<any>('/analytics/admin/overview'),
    
    // 管理员用户活跃度
    getAdminUserActivity: (days?: number) =>
      apiRequest<any>(`/analytics/admin/user-activity${days ? `?days=${days}` : ''}`),
    
    // 管理员审计日志
    getAdminAuditLogs: (params?: { page?: number; limit?: number; action?: string; userId?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      if (params?.action) query.append('action', params.action);
      if (params?.userId) query.append('userId', params.userId);
      const queryString = query.toString();
      return apiRequest<any>(`/analytics/admin/audit-logs${queryString ? `?${queryString}` : ''}`);
    },
    
    // 记录使用统计
    track: (data: {
      agentId?: string;
      sessionId?: string;
      actionType: string;
      creditsUsed?: number;
      tokensInput?: number;
      tokensOutput?: number;
      modelUsed?: string;
      durationMs?: number;
    }) =>
      apiRequest<{ success: boolean }>('/analytics/track', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // ============================================
  // 知识库/文件管理
  // ============================================
  files: {
    // 获取文件列表
    getAll: (params?: { projectId?: string; agentId?: string }) => {
      const query = new URLSearchParams();
      if (params?.projectId) query.append('projectId', params.projectId);
      if (params?.agentId) query.append('agentId', params.agentId);
      const queryString = query.toString();
      return apiRequest<any[]>(`/files${queryString ? `?${queryString}` : ''}`);
    },
    
    // 上传文件
    upload: (data: {
      fileName: string;
      fileType: string;
      fileContent: string; // Base64
      projectId?: string;
      agentId?: string;
    }) =>
      apiRequest<{ success: boolean; file: any }>('/files/upload', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    
    // 知识检索（RAG）
    search: (data: { query: string; projectId?: string; agentId?: string; limit?: number }) =>
      apiRequest<{ results: any[] }>('/files/search', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    
    // 获取文件内容
    getContent: (fileId: string) => apiRequest<{ fileName: string; fileType: string; content: string }>(`/files/${fileId}/content`),
    
    // 删除文件
    delete: (fileId: string) =>
      apiRequest<{ success: boolean }>(`/files/${fileId}`, {
        method: 'DELETE',
      }),
  },

  // ============================================
  // 数据导入导出
  // ============================================
  export: {
    // 获取导出任务列表
    getJobs: () => apiRequest<any[]>('/export/jobs'),
    
    // 创建导出任务
    create: (exportType: 'sessions' | 'messages' | 'agents' | 'projects' | 'all', format?: 'json' | 'csv') =>
      apiRequest<{ success: boolean; jobId: string }>('/export/create', {
        method: 'POST',
        body: JSON.stringify({ exportType, format }),
      }),
    
    // 下载导出文件
    download: async (jobId: string) => {
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/export/download/${jobId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    },
    
    // 导入数据
    import: (importType: 'sessions' | 'agents' | 'projects' | 'all', data: any) =>
      apiRequest<{ success: boolean; importedCount: number }>('/export/import', {
        method: 'POST',
        body: JSON.stringify({ importType, data }),
      }),
  },

  // ============================================
  // API 配置管理
  // ============================================
  apiConfigs: {
    // 获取所有 API 配置
    getAll: () => apiRequest<any[]>('/admin/api-configs'),
    
    // 获取单个配置（包含完整 API Key）
    getById: (id: string) => apiRequest<any>(`/admin/api-configs/${id}`),
    
    // 创建 API 配置
    create: (data: {
      name: string;
      provider: string;
      apiKey: string;
      baseUrl: string;
      modelMapping?: Record<string, string>;
      description?: string;
      requestConfig?: any;
      isActive?: boolean;
    }) =>
      apiRequest<any>('/admin/api-configs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    
    // 更新 API 配置
    update: (id: string, data: {
      name?: string;
      provider?: string;
      apiKey?: string;
      baseUrl?: string;
      modelMapping?: Record<string, string>;
      description?: string;
      requestConfig?: any;
      isActive?: boolean;
    }) =>
      apiRequest<any>(`/admin/api-configs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    
    // 删除 API 配置
    delete: (id: string) =>
      apiRequest<{ success: boolean }>(`/admin/api-configs/${id}`, {
        method: 'DELETE',
      }),
    
    // 测试 API 连接
    test: (id: string) =>
      apiRequest<{ 
        success: boolean; 
        message: string; 
        results?: any[];
        summary?: { total: number; passed: number; failed: number };
        status?: number;
      }>(`/admin/api-configs/${id}/test`, {
        method: 'POST',
      }),
  },

  // 用户偏好设置
  preferences: {
    // 获取所有偏好设置
    get: () =>
      apiRequest<{ preferences: any }>('/preferences'),
    
    // 更新偏好设置（部分更新）
    update: (preferences: {
      theme?: string;
      mode?: string;
      language?: string;
      modelName?: string;
      featureFlags?: Record<string, boolean>;
      [key: string]: any;
    }) =>
      apiRequest<{ success: boolean; preferences: any }>('/preferences', {
        method: 'PATCH',
        body: JSON.stringify(preferences),
      }),
    
    // 重置为默认值
    reset: () =>
      apiRequest<{ success: boolean; preferences: any }>('/preferences/reset', {
        method: 'POST',
      }),
    
    // 更新单个功能开关
    updateFeature: (feature: string, enabled: boolean) =>
      apiRequest<{ success: boolean; preferences: any }>(`/preferences/feature/${feature}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
  },

  // ============================================
  // PersonaCraft AI 知识库优化
  // ============================================
  personacraft: {
    // 生成初始优化（系统提示词和优化后的知识库）
    generate: (rawKnowledge: string) =>
      apiRequest<{ systemPrompt: string; optimizedKnowledge: string }>('/personacraft/generate', {
        method: 'POST',
        body: JSON.stringify({ rawKnowledge }),
      }),
    
    // 精炼内容（根据用户指令优化）
    refine: (data: {
      currentPrompt: string;
      currentKnowledge: string;
      instruction: string;
      history?: { role: string; content: string }[];
    }) =>
      apiRequest<{
        systemPrompt: string | null;
        optimizedKnowledge: string | null;
        chatResponse: string;
      }>('/personacraft/refine', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // ============================================
  // 系统级全局设置（所有用户共享）
  // ============================================
  systemSettings: {
    // 获取系统设置（公开接口）
    get: () => apiRequest<any>('/system-settings'),
    
    // 更新系统设置（需要管理员权限）
    update: (settings: {
      showTrendAnalysis?: boolean;
      showSimulator?: boolean;
      enableStylePrompt?: boolean;
      showGoalLanding?: boolean;
      enableWebSocket?: boolean;
      showContextDrawer?: boolean;
      showThoughtChain?: boolean;
      showFollowUps?: boolean;
      showRichActions?: boolean;
      allowModelSelect?: boolean;
      modelName?: string;
      availableModels?: { id: string; name: string }[];
      agentCategories?: string[];
      [key: string]: any;
    }) =>
      apiRequest<{ success: boolean; settings: any }>('/system-settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }),
    
    // 重置为默认值
    reset: () =>
      apiRequest<{ success: boolean; settings: any }>('/system-settings/reset', {
        method: 'POST',
      }),
  },
};

