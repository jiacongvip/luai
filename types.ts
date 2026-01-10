
export type Language = 'en' | 'zh';

export type ThemeId = 'blue' | 'emerald' | 'violet' | 'rose' | 'amber';
export type ThemeMode = 'dark' | 'light';

export interface Theme {
  id: ThemeId;
  name: string;
  colors: {
    primary: string;
    primaryHover: string;
    accent: string;
  }
}

// --- Onboarding / Context Types ---

export type FormFieldType = 'text' | 'textarea' | 'select' | 'number' | 'file';

export interface FormField {
  id: string;
  key: string; // The variable name used in DB/Workflow (e.g., "industry")
  label: string; // Display label (e.g., "What industry are you in?")
  type: FormFieldType;
  required: boolean;
  options?: string[]; // For 'select' type
  placeholder?: string;
}

export interface UserProfileData {
  [key: string]: string | number | string[] | Record<string, string>;
}

export interface ProjectContext {
    id: string;
    name: string; // Display name (e.g., "iPhone 15 Launch")
    description?: string;
    data: UserProfileData; // The actual form answers
    updatedAt: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  credits: number;
  avatar: string;
  role?: 'user' | 'admin';
  status?: 'active' | 'suspended';
  joinedAt?: string;
  // Multi-Project Context Support
  projects: ProjectContext[];
  activeProjectId?: string; // ID of the currently selected context
  preferences?: string; // NEW: Long-term memory / Global user instructions
}

export interface PromptTemplate {
    id: string;
    label: string; // e.g. "Generate {{industry}} Copy"
    prompt: string; // e.g. "Write a copy for {{product_name}}..."
    icon: string; // Lucide icon name
    targetAgentId?: string; // Optional: Force a specific agent
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  role_zh?: string;
  description: string;
  description_zh?: string;
  avatar: string;
  pricePerMessage: number;
  systemPrompt: string;
  category: string; // Changed from fixed union type to string to support custom categories
  knowledgeFiles?: string[];
  styles?: string[]; // NEW: Presets for tone/style (e.g. "Sarcastic", "Professional")
  welcomeMessage?: string; // NEW: Custom welcome message shown when chat starts
}

export interface AgentSquad {
    id: string;
    name: string;
    description: string;
    memberAgentIds: string[];
    avatar?: string;
    assignedToUserIds?: string[]; // NEW: Control which users can see/use this squad
}

export interface ModelConfig {
    id: string; // The actual API model string (e.g., "gemini-2.0-flash-exp")
    name: string; // Display name (e.g., "Gemini 2.0 Flash")
}

export enum MessageType {
  USER = 'USER',
  AGENT = 'AGENT',
  SYSTEM_COST_CONFIRM = 'SYSTEM_COST_CONFIRM',
  SYSTEM_STYLE_REQUEST = 'SYSTEM_STYLE_REQUEST', // NEW: Interruption to ask for style
  SYSTEM_INFO = 'SYSTEM_INFO',
  THOUGHT_CHAIN = 'THOUGHT_CHAIN'
}

export interface ThoughtData {
    step: 'analyzing' | 'routing' | 'done';
    intent: string;
    contextUsed: string[];
    targetAgentId: string;
    confidence: number;
    manualOverride?: boolean;
}

export interface InteractiveOption {
  label: string; // 显示文本
  value: string; // 选择后发送的值
  description?: string; // 可选描述
}

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  timestamp: number;
  cost?: number;
  relatedAgentId?: string;
  isStreaming?: boolean;
  thoughtData?: ThoughtData;
  // New interaction fields
  suggestedFollowUps?: string[];
  interactiveOptions?: InteractiveOption[]; // 选项式交互（如：选择目标受众）
  feedback?: 'like' | 'dislike' | null;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: number;
  messages: Message[];
  isGroup?: boolean;
  participants?: string[]; // Agent IDs
}

// --- Orchestration / Workflow Types ---

export type NodeType = 'start' | 'end' | 'llm' | 'retrieval' | 'code' | 'condition' | 'agent' | 'classifier' | 'user_profile';

export interface WorkflowNodeData {
  label: string;
  // Common
  description?: string;
  // LLM Node
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // Retrieval Node
  datasetId?: string;
  topK?: number;
  // Code Node
  codeLanguage?: 'python' | 'javascript';
  codeSnippet?: string;
  // Agent Node
  agentId?: string;
  costOverride?: number;
  // Condition Node
  variable?: string;
  operator?: 'contains' | 'equals' | 'empty';
  value?: string;
  // Classifier Node
  intents?: string[];
  // User Profile Node
  outputFields?: string[]; // Which fields to fetch (e.g. ['industry', 'role'])
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string; // For condition branches (e.g., "True", "False") or intents
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  status: 'draft' | 'published';
  updatedAt: number;
  createdBy: string;
}

export enum AppRoute {
  LOGIN = 'login',
  REGISTER = 'register',
  HOME = 'home', // NEW: Goal-Oriented Home Page
  CONTEXT_MANAGER = 'context/manager', 
  CHAT = 'chat',
  AGENTS = 'agents',
  AGENT_CREATE = 'agents/create',
  PROFILE = 'profile',
  BILLING = 'billing',
  SUPPORT = 'support',
  ADMIN = 'admin',
  STUDIO = 'studio',
  TRENDS = 'trends',
  SIMULATOR = 'simulator',
  PERSONACRAFT = 'personacraft' // PersonaCraft AI 知识库优化
}

// 管理后台路由
export enum AdminRoute {
  LOGIN = 'admin/login',
  DASHBOARD = 'admin/dashboard',
  USERS = 'admin/users',
  AGENTS = 'admin/agents',
  SETTINGS = 'admin/settings',
}
