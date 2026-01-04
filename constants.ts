
import { Agent, User, Language, Theme, PromptTemplate } from './types';

export const THEMES: Theme[] = [
  { 
    id: 'blue', 
    name: 'Cosmic Blue', 
    colors: { 
      primary: '#3b82f6', 
      primaryHover: '#2563eb', 
      accent: '#8b5cf6'
    } 
  },
  { 
    id: 'emerald', 
    name: 'Emerald Forest', 
    colors: { 
      primary: '#10b981', 
      primaryHover: '#059669', 
      accent: '#34d399'
    } 
  },
  { 
    id: 'violet', 
    name: 'Electric Violet', 
    colors: { 
      primary: '#8b5cf6', 
      primaryHover: '#7c3aed', 
      accent: '#c026d3'
    } 
  },
  { 
    id: 'rose', 
    name: 'Neon Rose', 
    colors: { 
      primary: '#f43f5e', 
      primaryHover: '#e11d48', 
      accent: '#fb7185'
    } 
  },
  { 
    id: 'amber', 
    name: 'Sunset Amber', 
    colors: { 
      primary: '#f59e0b', 
      primaryHover: '#d97706', 
      accent: '#fbbf24'
    } 
  }
];

export const MOCK_USER: User = {
  id: 'u1',
  name: 'Alex Chen',
  email: 'alex.chen@example.com',
  credits: 500.0,
  avatar: 'https://picsum.photos/200/200?random=1',
  role: 'admin',
  status: 'active',
  joinedAt: '2023-10-15',
  activeProjectId: 'p1',
  preferences: 'Always prefer concise answers. Avoid marketing fluff unless I explicitly ask for a creative copy. I prefer code snippets in Python over JavaScript where possible.',
  projects: [
      {
          id: 'p1',
          name: 'Nexus Launch Campaign',
          description: 'Marketing assets for the Q4 product launch.',
          updatedAt: Date.now(),
          data: {
              industry: 'SaaS',
              product_name: 'Nexus AI',
              highlights: 'Multi-agent orchestration, Drag & drop workflow, Pay-per-use.',
              target_audience: 'Developers, Product Managers, Enterprises'
          }
      },
      {
          id: 'p2',
          name: 'Smart Home App',
          description: 'Development context for the mobile app.',
          updatedAt: Date.now() - 86400000,
          data: {
              industry: 'IoT / Smart Home',
              product_name: 'Lumiere Control',
              highlights: 'Energy saving, Voice control integration, Local processing.',
              target_audience: 'Homeowners, Tech enthusiasts'
          }
      }
  ]
};

export const MOCK_ALL_USERS: User[] = [
    MOCK_USER,
    {
        id: 'u2',
        name: 'Sarah Johnson',
        email: 'sarah.j@example.com',
        credits: 120.5,
        avatar: 'https://picsum.photos/200/200?random=10',
        role: 'user',
        status: 'active',
        joinedAt: '2023-11-02',
        projects: []
    },
    {
        id: 'u3',
        name: 'Mike Zhang',
        email: 'mike.z@tech.com',
        credits: 0.0,
        avatar: 'https://picsum.photos/200/200?random=11',
        role: 'user',
        status: 'suspended',
        joinedAt: '2023-09-20',
        projects: []
    },
    {
        id: 'u4',
        name: 'Emily Davis',
        email: 'emily.d@creative.io',
        credits: 2450.0,
        avatar: 'https://picsum.photos/200/200?random=12',
        role: 'user',
        status: 'active',
        joinedAt: '2023-12-05',
        projects: []
    },
    {
        id: 'u5',
        name: 'David Wilson',
        email: 'd.wilson@corp.net',
        credits: 50.0,
        avatar: 'https://picsum.photos/200/200?random=13',
        role: 'user',
        status: 'active',
        joinedAt: '2023-11-15',
        projects: []
    }
];

export const MOCK_AGENTS: Agent[] = [
  {
    id: 'a1',
    name: 'Nexus Orchestrator',
    role: 'Assistant',
    role_zh: '智能助手',
    description: 'The main system AI capable of general tasks and routing complex requests to specialists.',
    description_zh: '主系统AI，能够处理一般任务并将复杂请求路由给专家。',
    avatar: 'https://picsum.photos/200/200?random=2',
    pricePerMessage: 0,
    category: 'General',
    systemPrompt: 'You are Nexus, a helpful AI orchestrator. You help users solve problems. If a task is complex, you suggest specific experts.',
    knowledgeFiles: ['nexus_documentation_v2.pdf', 'company_policies.txt']
  },
  {
    id: 'a2',
    name: 'CopyMaster',
    role: 'Copywriter',
    role_zh: '文案专家',
    description: 'Expert in marketing copy, slogans, and SEO-optimized content writing.',
    description_zh: '擅长营销文案、口号和SEO优化内容写作的专家。',
    avatar: 'https://picsum.photos/200/200?random=3',
    pricePerMessage: 5,
    category: 'Marketing',
    systemPrompt: 'You are CopyMaster, a world-class copywriter. You write punchy, persuasive, and SEO-friendly marketing copy.',
    knowledgeFiles: ['seo_guidelines_2024.pdf', 'successful_ad_copies.csv'],
    styles: ['🔥 爆款/震惊类', '❤️ 情感共鸣类', '😏 犀利嘲讽类', '📊 硬核干货类', '💼 专业商务类']
  },
  {
    id: 'a3',
    name: 'CodeWizard',
    role: 'Developer',
    role_zh: '高级开发',
    description: 'Senior Full-Stack engineer specializing in React, Python, and System Architecture.',
    description_zh: '专精于React、Python和系统架构的高级全栈工程师。',
    avatar: 'https://picsum.photos/200/200?random=4',
    pricePerMessage: 10,
    category: 'Coding',
    systemPrompt: 'You are CodeWizard, a senior software engineer. You provide clean, efficient, and well-commented code solutions.',
    knowledgeFiles: ['api_reference_docs.json'],
    styles: ['Python', 'React/TS', 'System Design', 'Debug', 'Code Review']
  },
  {
    id: 'a4',
    name: 'DataVizard',
    role: 'Data Analyst',
    role_zh: '数据分析师',
    description: 'Transforms complex datasets into clear insights and visualizations.',
    description_zh: '将复杂的数据集转化为清晰的见解和可视化图表。',
    avatar: 'https://picsum.photos/200/200?random=5',
    pricePerMessage: 8,
    category: 'Data',
    systemPrompt: 'You are DataVizard, a data science expert. You explain data trends and suggest visualizations.',
    knowledgeFiles: []
  },
    {
    id: 'a5',
    name: 'LegalEagle',
    role: 'Legal Assistant',
    role_zh: '法律助手',
    description: 'Drafts contracts and reviews legal documents for standard compliance.',
    description_zh: '起草合同并审查法律文件的合规性。',
    avatar: 'https://picsum.photos/200/200?random=6',
    pricePerMessage: 15,
    category: 'General',
    systemPrompt: 'You are LegalEagle. You assist with drafting basic legal documents. Disclaimer: You are an AI, not a lawyer.',
    knowledgeFiles: ['standard_contract_templates.docx']
  }
];

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
    {
        id: 'pt-1',
        label: '📝 Generate {{industry}} Copy',
        prompt: 'I am the product manager for {{product_name}} in the {{industry}} industry. My product highlights are: {{highlights}}. Please write an engaging social media post (RedNote/Instagram style) with emojis. @CopyMaster',
        icon: 'PenTool',
        targetAgentId: 'a2'
    },
    {
        id: 'pt-2',
        label: '📧 Cold Email for {{product_name}}',
        prompt: 'Write a cold outreach email for {{product_name}} targeting clients in the {{industry}} sector. Emphasize our key selling points: {{highlights}}. Keep it under 200 words and professional. @CopyMaster',
        icon: 'Mail',
        targetAgentId: 'a2'
    },
    {
        id: 'pt-3',
        label: '📊 {{industry}} Market Trends',
        prompt: 'As a data expert, please analyze the current market trends, growth rate, and key challenges for the {{industry}} industry. @DataVizard',
        icon: 'BarChart',
        targetAgentId: 'a4'
    },
    {
        id: 'pt-4',
        label: '💻 Architecture for {{product_name}}',
        prompt: 'Based on the requirements for {{product_name}} ({{description}}), design a high-level technical architecture suitable for a {{industry}} application. @CodeWizard',
        icon: 'Cpu',
        targetAgentId: 'a3'
    }
];

export const getWelcomeMessage = (lang: Language) => {
  return lang === 'zh' 
    ? "你好！我是 Nexus。我可以为您提供帮助，您也可以使用 @ 提及像 @CodeWizard 这样的专业智能体来完成特定任务。今天我能帮您什么？"
    : "Hello! I'm Nexus. I can help you directly, or you can use @ to mention specialized agents like @CodeWizard or @CopyMaster for expert tasks. How can I help today?";
};

export const INITIAL_WELCOME_MSG = getWelcomeMessage('en'); // Default fallback
