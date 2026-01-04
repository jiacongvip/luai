
import React, { useState, useEffect } from 'react';
import { User, Agent, Language, Workflow, WorkflowNode, FormField, FormFieldType, PromptTemplate, AgentSquad, ModelConfig } from '../types';
import { translations } from '../utils/translations';
import { MOCK_ALL_USERS } from '../constants';
import { Search, Shield, Users, Bot, Settings, Plus, Edit, Trash2, FileText, Upload, X, Workflow as WorkflowIcon, ClipboardList, GripVertical, Database, Layout, PenTool, Mail, BarChart, Cpu, CheckCircle, UserPlus, CheckSquare, Lightbulb, Zap, TrendingUp, DollarSign, MessageSquare, Activity, AlertCircle, Loader2, Eye, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import OrchestrationStudio from './OrchestrationStudio';
import { storage } from '../utils/storage';
import AgentEditModal from '../components/modals/AgentEditModal';
import UserEditModal from '../components/modals/UserEditModal';
import SettingsTab from './admin/SettingsTab';
import { api } from '../utils/api';
import { handleError } from '../utils/errorHandler';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, AreaChart, Area } from 'recharts';

interface AdminDashboardProps {
  language: Language;
  onboardingConfig: FormField[];
  onUpdateOnboardingConfig: (config: FormField[]) => void;
  promptTemplates: PromptTemplate[];
  onUpdatePromptTemplates: (templates: PromptTemplate[]) => void;
  onToggleTrendAnalysis?: (enabled: boolean) => void;
  onToggleStylePrompt?: (enabled: boolean) => void; 
  onToggleSimulator?: (enabled: boolean) => void; 
  onToggleGoalLanding?: (enabled: boolean) => void; 
  agents: Agent[]; 
  onUpdateAgents: (agents: Agent[]) => void;
  activeTab: 'analytics' | 'users' | 'agents' | 'squads' | 'settings' | 'workflows' | 'onboarding' | 'templates' | 'knowledge' | 'audit';
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  language, 
  onboardingConfig, 
  onUpdateOnboardingConfig, 
  promptTemplates, 
  onUpdatePromptTemplates, 
  onToggleTrendAnalysis, 
  onToggleStylePrompt, 
  onToggleSimulator, 
  onToggleGoalLanding,
  agents, 
  onUpdateAgents,
  activeTab
}) => {
  const tAdmin = translations[language]?.admin || translations['en'].admin;
  const tCommon = translations[language]?.common || translations['en'].common;
  const tMarketplace = translations[language]?.marketplace || translations['en'].marketplace;
  
  const t = tAdmin;

  // --- Data State ---
  const [squads, setSquads] = useState<AgentSquad[]>(() => storage.loadSquads() || []);
  
  // PRE-CONFIGURED WORKFLOW TEMPLATE FOR USER REQUEST
  const [workflows, setWorkflows] = useState<Workflow[]>([
      { 
          id: 'wf-smart-copy', 
          name: language === 'zh' ? '智能文案编排 (Smart Copy)' : 'Smart Copywriting Flow', 
          description: 'Detects audience habits/age/goal from input, then generates targeted copy.', 
          nodes: [
            { id: 'start', type: 'start', position: { x: 100, y: 300 }, data: { label: 'Start', description: 'User input triggering the flow.' } },
            { id: 'analyzer', type: 'llm', position: { x: 450, y: 300 }, data: { label: 'Requirement Analyzer', systemPrompt: 'Analyze the user input. Extract the following fields and return strictly as JSON:\n1. "target_age": Age group of the audience.\n2. "habits": Habits or pain points of the audience.\n3. "goal": The goal of the copy (e.g., Traffic, Sales, Persona Building).\n4. "format": The format (e.g., Video Script, RedNote Post).', model: 'gemini-3-flash-preview' } },
            { id: 'writer', type: 'agent', position: { x: 800, y: 300 }, data: { label: 'CopyMaster Agent', agentId: 'a2', description: 'Generates the copy based on analysis.' } },
            { id: 'end', type: 'end', position: { x: 1150, y: 300 }, data: { label: 'End' } }
          ], 
          edges: [
            { id: 'e1', source: 'start', target: 'analyzer' },
            { id: 'e2', source: 'analyzer', target: 'writer' },
            { id: 'e3', source: 'writer', target: 'end' }
          ], 
          status: 'published', 
          updatedAt: Date.now(), 
          createdBy: 'System' 
      },
      { id: 'wf-1', name: 'Customer Support Triaging', description: 'Classify tickets and route to agents.', nodes: [], edges: [], status: 'published', updatedAt: Date.now(), createdBy: 'Admin' }
  ]);
  
  const [users, setUsers] = useState<User[]>(MOCK_ALL_USERS);
  // Agents state removed here, using prop 'agents' instead
  
  // Agent Categories State
  const [agentCategories, setAgentCategories] = useState<string[]>(() => storage.loadAgentCategories());

  // --- UI State ---
  const [userSearch, setUserSearch] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [editingSquad, setEditingSquad] = useState<AgentSquad | null>(null);
  const [assigningSquad, setAssigningSquad] = useState<AgentSquad | null>(null); 
  const [isEditingWorkflow, setIsEditingWorkflow] = useState(false);
  const [currentWorkflowNodes, setCurrentWorkflowNodes] = useState<WorkflowNode[] | undefined>(undefined);
  
  // Drag & Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDragEnabled, setIsDragEnabled] = useState(false);

  // Mock System Files
  const [systemFiles, setSystemFiles] = useState<{name: string, size: string, date: string}[]>([
      { name: 'global_compliance_policy.pdf', size: '2.4 MB', date: '2023-10-24' },
      { name: 'brand_voice_guidelines_v2.docx', size: '1.1 MB', date: '2023-11-05' },
      { name: 'product_catalog_Q4.json', size: '450 KB', date: '2023-11-12' }
  ]);

  // Analytics State
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);

  // Persistence
  useEffect(() => {
      storage.saveSquads(squads);
  }, [squads]);

  // Load analytics data when tab is active
  useEffect(() => {
    if (activeTab === 'analytics') {
      loadAnalyticsData();
    }
  }, [activeTab]);

  // Load audit logs when tab is active
  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab, auditPage]);

  const loadAnalyticsData = async () => {
    try {
      setAnalyticsLoading(true);
      const data = await api.analytics.getAdminOverview();
      setAnalyticsData(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      // Use mock data
      setAnalyticsData({
        users: { total: 128, active: 95, newThisWeek: 12, activeToday: 34 },
        agents: { total: 45, public: 32, newThisWeek: 5 },
        messages: { total: 12450, today: 245, thisWeek: 1890 },
        revenue: { total: 4520.50, thisMonth: 1280.00, thisWeek: 450.00 },
        systemHealth: { status: 'healthy', uptime: 864000 },
      });
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setAuditLoading(true);
      const data = await api.analytics.getAdminAuditLogs({ page: auditPage, limit: 20 });
      setAuditLogs(data.logs || []);
      setAuditTotal(data.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  };

  // Handler for category updates
  const handleUpdateCategories = (newCategories: string[]) => {
      setAgentCategories(newCategories);
      storage.saveAgentCategories(newCategories);
  };

  // --- Logic Handlers ---
  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()));

  const handleSaveUser = async (updatedUser: User) => {
      try {
          // 保存到数据库
          await api.admin.updateUser(updatedUser.id, {
              name: updatedUser.name,
              email: updatedUser.email,
              credits: updatedUser.credits,
              role: updatedUser.role,
              status: updatedUser.status,
          });
          
          // 更新前端状态
          setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
          setEditingUser(null);
      } catch (error: any) {
          console.error('Failed to save user:', error);
          handleError(error, {
              action: 'save user',
              component: 'AdminDashboard',
          });
      }
  };

  // Updated to use prop callback and save to database
  const handleSaveAgent = async (updatedAgent: Agent) => {
      try {
          // 检查是否是临时 ID（新创建的智能体）
          const isNew = updatedAgent.id.startsWith('a-') && !agents.find(a => a.id === updatedAgent.id);
          
          if (isNew) {
              // 创建新智能体
              console.log('Creating new agent:', updatedAgent);
              const result = await api.agents.create({
                  name: updatedAgent.name,
                  role: updatedAgent.role,
                  roleZh: updatedAgent.role_zh,
                  description: updatedAgent.description,
                  descriptionZh: updatedAgent.description_zh,
                  avatar: updatedAgent.avatar,
                  pricePerMessage: updatedAgent.pricePerMessage,
                  category: updatedAgent.category,
                  systemPrompt: updatedAgent.systemPrompt || 'You are a helpful assistant.',
                  styles: updatedAgent.styles || [],
              });
              
              console.log('Agent created, result:', result);
              
              // 使用后端返回的完整数据更新前端状态
              const newAgent: Agent = {
                  id: result.id,
                  name: result.name,
                  role: result.role,
                  role_zh: result.roleZh,
                  description: result.description,
                  description_zh: result.descriptionZh,
                  avatar: result.avatar,
                  pricePerMessage: result.pricePerMessage,
                  category: result.category,
                  systemPrompt: result.systemPrompt,
                  styles: result.styles || [],
                  knowledgeFiles: updatedAgent.knowledgeFiles || [],
              };
              
              onUpdateAgents([...agents, newAgent]);
          } else {
              // 更新现有智能体
              console.log('Updating existing agent:', updatedAgent.id);
              const result = await api.agents.update(updatedAgent.id, {
                  name: updatedAgent.name,
                  role: updatedAgent.role,
                  roleZh: updatedAgent.role_zh,
                  description: updatedAgent.description,
                  descriptionZh: updatedAgent.description_zh,
                  avatar: updatedAgent.avatar,
                  pricePerMessage: updatedAgent.pricePerMessage,
                  category: updatedAgent.category,
                  systemPrompt: updatedAgent.systemPrompt,
                  styles: updatedAgent.styles || [],
              });
              
              console.log('Agent updated, result:', result);
              
              // 更新前端状态
              onUpdateAgents(agents.map(a => a.id === updatedAgent.id ? updatedAgent : a));
          }
          
          setEditingAgent(null);
      } catch (error: any) {
          console.error('Failed to save agent:', error);
          console.error('Error details:', error.message, error.stack);
          handleError(error, {
              action: 'save agent',
              component: 'AdminDashboard',
          });
      }
  };

  // Updated to use prop callback and delete from database
  const handleDeleteAgent = async (agentId: string) => {
      if (confirm('Are you sure you want to delete this agent?')) {
          try {
              await api.agents.delete(agentId);
              onUpdateAgents(agents.filter(a => a.id !== agentId));
          } catch (error: any) {
              console.error('Failed to delete agent:', error);
              handleError(error, {
                  action: 'delete agent',
                  component: 'AdminDashboard',
              });
          }
      }
  };
  
  const handleSaveTemplate = async (template: PromptTemplate) => {
      try {
          const isNew = !promptTemplates.find(t => t.id === template.id);
          
          if (isNew) {
              // 创建新模板
              const result = await api.promptTemplates.create({
                  label: template.label,
                  prompt: template.prompt,
                  icon: template.icon,
                  targetAgentId: template.targetAgentId,
              });
              
              // 使用后端返回的 ID 更新前端状态
              const newTemplate = { ...template, id: result.id };
              onUpdatePromptTemplates([...promptTemplates, newTemplate]);
          } else {
              // 更新现有模板
              await api.promptTemplates.update(template.id, {
                  label: template.label,
                  prompt: template.prompt,
                  icon: template.icon,
                  targetAgentId: template.targetAgentId,
              });
              
              // 更新前端状态
              onUpdatePromptTemplates(promptTemplates.map(t => t.id === template.id ? template : t));
          }
          
          setEditingTemplate(null);
      } catch (error: any) {
          console.error('Failed to save template:', error);
          handleError(error, {
              action: 'save template',
              component: 'AdminDashboard',
          });
      }
  };
  
  const handleDeleteTemplate = async (id: string) => {
      if (confirm('Delete this template?')) {
          try {
              await api.promptTemplates.delete(id);
              onUpdatePromptTemplates(promptTemplates.filter(t => t.id !== id));
          } catch (error: any) {
              console.error('Failed to delete template:', error);
              handleError(error, {
                  action: 'delete template',
                  component: 'AdminDashboard',
              });
          }
      }
  }

  const handleSaveSquad = async (squad: AgentSquad) => {
      try {
          const isNew = !squads.find(s => s.id === squad.id);
          
          if (isNew) {
              // 创建新群组
              const result = await api.squads.create({
                  name: squad.name,
                  description: squad.description,
                  avatar: squad.avatar,
                  memberAgentIds: squad.memberAgentIds || [],
                  assignedToUserIds: squad.assignedToUserIds || [],
              });
              
              // 使用后端返回的 ID 更新前端状态
              const newSquad = { ...squad, id: result.id };
              setSquads(prev => [...prev, newSquad]);
          } else {
              // 更新现有群组
              await api.squads.update(squad.id, {
                  name: squad.name,
                  description: squad.description,
                  avatar: squad.avatar,
                  memberAgentIds: squad.memberAgentIds || [],
                  assignedToUserIds: squad.assignedToUserIds || [],
              });
              
              // 更新前端状态
              setSquads(prev => prev.map(s => s.id === squad.id ? squad : s));
          }
          
          setEditingSquad(null);
          setAssigningSquad(null);
      } catch (error: any) {
          console.error('Failed to save squad:', error);
          handleError(error, {
              action: 'save squad',
              component: 'AdminDashboard',
          });
      }
  };

  const handleDeleteSquad = async (id: string) => {
      if (confirm('Delete this squad?')) {
          try {
              await api.squads.delete(id);
              setSquads(prev => prev.filter(s => s.id !== id));
          } catch (error: any) {
              console.error('Failed to delete squad:', error);
              handleError(error, {
                  action: 'delete squad',
                  component: 'AdminDashboard',
              });
          }
      }
  };

  const createNewAgent = () => {
      const newAgent: Agent = {
          id: `a-${Date.now()}`,
          name: 'New Agent',
          role: 'Assistant',
          role_zh: '助手',
          description: 'A new AI assistant.',
          description_zh: '一个新的AI助手。',
          avatar: 'https://picsum.photos/200/200?random=100',
          pricePerMessage: 5,
          category: 'General',
          systemPrompt: 'You are a helpful assistant.',
          knowledgeFiles: []
      };
      setEditingAgent(newAgent);
  };

  const createNewSquad = () => {
      setEditingSquad({
          id: `sq-${Date.now()}`,
          name: 'New Squad',
          description: 'A collaborative group of agents.',
          memberAgentIds: ['a1'],
          assignedToUserIds: [] 
      });
  };
  
  const createNewTemplate = () => {
      setEditingTemplate({
          id: `pt-${Date.now()}`,
          label: 'Generate {{key}}',
          prompt: 'Write something about {{key}}...',
          icon: 'Zap'
      });
  }

   const addField = () => {
      const newField: FormField = { id: Date.now().toString(), key: `field_${Date.now()}`, label: 'New Question', type: 'text', required: true };
      onUpdateOnboardingConfig([...onboardingConfig, newField]);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
      onUpdateOnboardingConfig(onboardingConfig.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const removeField = (id: string) => {
      onUpdateOnboardingConfig(onboardingConfig.filter(f => f.id !== id));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
      if (!isDragEnabled) { e.preventDefault(); return; }
      setDraggedIndex(index);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === targetIndex) return;
      const updatedConfig = [...onboardingConfig];
      const [movedItem] = updatedConfig.splice(draggedIndex, 1);
      updatedConfig.splice(targetIndex, 0, movedItem);
      onUpdateOnboardingConfig(updatedConfig);
      setDraggedIndex(null);
  };

  const handleWorkflowDeploy = async (nodes: WorkflowNode[]) => {
      try {
          const workflowName = nodes.find(n => n.type === 'start')?.data.label || 'New Workflow';
          
          // 保存到数据库
          const result = await api.workflows.create({
              name: workflowName,
              description: 'Custom orchestration flow',
              nodes: nodes,
              edges: [],
              status: 'published',
          });
          
          // 更新前端状态
          const newWorkflow: Workflow = {
              id: result.id,
              name: result.name,
              description: result.description || 'Custom orchestration flow',
              nodes: result.nodes,
              edges: result.edges || [],
              status: result.status || 'published',
              updatedAt: new Date(result.updatedAt).getTime(),
              createdBy: result.createdBy || 'Admin'
          };
          
          setWorkflows(prev => [newWorkflow, ...prev]);
          setIsEditingWorkflow(false);
          setCurrentWorkflowNodes(undefined);
      } catch (error: any) {
          console.error('Failed to save workflow:', error);
          handleError(error, {
              action: 'save workflow',
              component: 'AdminDashboard',
          });
      }
  };

  const handleEditWorkflow = (wf: Workflow) => {
      setCurrentWorkflowNodes(wf.nodes);
      setIsEditingWorkflow(true);
  };

  const toggleSelectAllUsers = (isSelect: boolean) => {
      if (!assigningSquad) return;
      if (isSelect) {
          const allVisibleIds = filteredUsers.map(u => u.id);
          const currentAssigned = new Set(assigningSquad.assignedToUserIds || []);
          allVisibleIds.forEach(id => currentAssigned.add(id));
          setAssigningSquad({...assigningSquad, assignedToUserIds: Array.from(currentAssigned)});
      } else {
          const allVisibleIds = filteredUsers.map(u => u.id);
          const newAssigned = (assigningSquad.assignedToUserIds || []).filter(id => !allVisibleIds.includes(id));
          setAssigningSquad({...assigningSquad, assignedToUserIds: newAssigned});
      }
  };

  // --- Render Functions ---
  const renderUserTable = () => (
    <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm w-full">
      <div className="p-4 border-b border-border flex items-center gap-4 bg-background/50">
        <Search className="text-textSecondary" size={18} />
        <input 
          type="text" 
          placeholder={t.searchUser} 
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          className="bg-transparent border-none text-textMain placeholder-textSecondary focus:ring-0 w-full"
        />
      </div>
      <table className="w-full text-left text-sm text-textMain">
        <thead className="bg-background text-xs uppercase font-medium text-textSecondary">
          <tr>
            <th className="px-6 py-3">{t.columns.user}</th>
            <th className="px-6 py-3">{t.columns.status}</th>
            <th className="px-6 py-3">{t.columns.credits}</th>
            <th className="px-6 py-3">{t.columns.joined}</th>
            <th className="px-6 py-3 text-right">{t.columns.actions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filteredUsers.map(u => (
            <tr key={u.id} className="hover:bg-background/50 transition-colors">
              <td className="px-6 py-4 flex items-center gap-3">
                <img src={u.avatar} alt="" className="w-8 h-8 rounded-full bg-surface" />
                <div>
                  <div className="font-bold">{u.name}</div>
                  <div className="text-xs text-textSecondary">{u.email}</div>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs border ${u.status === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                  {u.status === 'active' ? t.status.active : t.status.suspended}
                </span>
              </td>
              <td className="px-6 py-4 font-mono">{u.credits.toFixed(2)}</td>
              <td className="px-6 py-4 text-textSecondary">{u.joinedAt || '2023-10-15'}</td>
              <td className="px-6 py-4 text-right">
                <button onClick={() => setEditingUser(u)} className="text-primary hover:text-primary-hover font-medium text-xs">
                  {t.actions.edit}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderAgentList = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={createNewAgent} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110">
          <Plus size={16} /> {tMarketplace.createCustom}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
          <div key={agent.id} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-4 group hover:border-primary/50 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <img src={agent.avatar} alt="" className="w-10 h-10 rounded-lg bg-background" />
                <div>
                  <div className="font-bold text-textMain">{agent.name}</div>
                  <div className="text-xs text-textSecondary">{agent.category}</div>
                </div>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditingAgent(agent)} className="p-1.5 hover:bg-background rounded text-textSecondary hover:text-primary">
                  <Edit size={14} />
                </button>
                <button onClick={() => handleDeleteAgent(agent.id)} className="p-1.5 hover:bg-background rounded text-textSecondary hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <p className="text-xs text-textSecondary line-clamp-2">{language === 'zh' ? agent.description_zh || agent.description : agent.description}</p>
            <div className="mt-auto pt-3 border-t border-border flex items-center justify-between text-xs">
              <span className="text-textMain font-mono">{agent.pricePerMessage} credits/msg</span>
              <span className="px-2 py-0.5 bg-background rounded text-textSecondary border border-border">{agent.role}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSquads = () => (
    <div className="space-y-4 w-full">
        <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-border">
            <div>
                <h3 className="font-bold text-textMain">{t.squads.title}</h3>
                <p className="text-xs text-textSecondary">{t.squads.subtitle}</p>
            </div>
            <button onClick={createNewSquad} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110">
                <Plus size={16} /> {t.squads.newSquad}
            </button>
        </div>
        
        {squads.length === 0 ? (
            <div className="text-center py-10 text-textSecondary italic border-2 border-dashed border-border rounded-xl">
                {t.squads.noSquads}
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {squads.map(sq => (
                    <div key={sq.id} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 group hover:border-primary/50 transition-all">
                        <div className="flex justify-between items-start">
                            <div className="font-bold text-textMain flex items-center gap-2">
                                <Users size={16} className="text-accent" />
                                {sq.name}
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingSquad(sq)} className="p-1.5 hover:bg-background rounded text-textSecondary hover:text-primary"><Edit size={14}/></button>
                                <button onClick={() => handleDeleteSquad(sq.id)} className="p-1.5 hover:bg-background rounded text-textSecondary hover:text-red-500"><Trash2 size={14}/></button>
                            </div>
                        </div>
                        <p className="text-xs text-textSecondary line-clamp-2 min-h-[2.5em]">{sq.description}</p>
                        
                        <div className="flex items-center gap-1 overflow-hidden py-2">
                            {sq.memberAgentIds.map(agentId => {
                                const agent = agents.find(a => a.id === agentId);
                                return agent ? (
                                    <img key={agentId} src={agent.avatar} className="w-6 h-6 rounded border border-surface bg-background" title={agent.name} />
                                ) : null;
                            })}
                            {sq.memberAgentIds.length === 0 && <span className="text-[10px] text-textSecondary italic">No members</span>}
                        </div>

                        <div className="mt-auto pt-3 border-t border-border flex items-center justify-between">
                            <div className="flex items-center gap-1 text-[10px] text-textSecondary">
                                <Users size={12}/> {sq.assignedToUserIds?.length || 0} Users
                            </div>
                            <button 
                                onClick={() => setAssigningSquad(sq)}
                                className="px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-bold hover:bg-primary hover:text-white transition-colors flex items-center gap-1"
                            >
                                <UserPlus size={12}/> {t.squads.assignAction}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );

  const renderTemplates = () => (
      <div className="space-y-4 w-full">
          <div className="flex justify-between items-center">
              <div>
                  <h3 className="font-bold text-textMain">{t.templates.title}</h3>
                  <p className="text-xs text-textSecondary">{t.templates.subtitle}</p>
              </div>
              <button onClick={createNewTemplate} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110">
                  <Plus size={16} /> {t.templates.newTemplate}
              </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {promptTemplates.map(template => (
                  <div key={template.id} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 group hover:border-primary/50 transition-all">
                      <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                              <div className="p-2 bg-background rounded-lg text-primary border border-border">
                                  <Zap size={16}/> 
                              </div>
                              <span className="font-bold text-textMain text-sm">{template.label}</span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditingTemplate(template)} className="p-1.5 hover:bg-background rounded text-textSecondary hover:text-primary"><Edit size={14}/></button>
                              <button onClick={() => handleDeleteTemplate(template.id)} className="p-1.5 hover:bg-background rounded text-textSecondary hover:text-red-500"><Trash2 size={14}/></button>
                          </div>
                      </div>
                      <div className="bg-background/50 p-2 rounded text-[10px] text-textSecondary font-mono border border-border/50 line-clamp-3">
                          {template.prompt}
                      </div>
                      {template.targetAgentId && (
                          <div className="mt-auto flex items-center gap-1 text-[10px] text-primary">
                              <Bot size={10}/>
                              Target: {agents.find(a => a.id === template.targetAgentId)?.name || 'Unknown'}
                          </div>
                      )}
                  </div>
              ))}
          </div>
      </div>
  );

  const renderWorkflows = () => {
      if (isEditingWorkflow) {
          return <OrchestrationStudio 
                    language={language} 
                    onBack={() => setIsEditingWorkflow(false)} 
                    onDeploy={handleWorkflowDeploy} 
                    existingNodes={currentWorkflowNodes} // PASS EXISTING NODES FOR EDITING
                 />;
      }

      return (
          <div className="space-y-6">
              <div className="flex justify-between items-center bg-surface p-6 rounded-2xl border border-border">
                  <div>
                      <h2 className="text-2xl font-bold text-textMain mb-2">{t.workflows.title}</h2>
                      <p className="text-textSecondary">{t.workflows.subtitle}</p>
                  </div>
                  <button 
                    onClick={() => {
                        setCurrentWorkflowNodes(undefined);
                        setIsEditingWorkflow(true);
                    }} 
                    className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
                  >
                      <Plus size={18} /> {t.workflows.createNew}
                  </button>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                  {workflows.map(wf => (
                      <div key={wf.id} className="bg-surface border border-border rounded-xl p-5 flex items-center justify-between group hover:border-primary/50 transition-all">
                          <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/20">
                                  <WorkflowIcon className="text-indigo-400" size={24} />
                              </div>
                              <div>
                                  <h3 className="font-bold text-textMain text-lg">{wf.name}</h3>
                                  <p className="text-xs text-textSecondary mb-1 line-clamp-1">{wf.description}</p>
                                  <div className="flex items-center gap-3 text-xs text-textSecondary opacity-70">
                                      <span>{t.workflows.status}: <span className="text-green-500 font-bold uppercase">{wf.status}</span></span>
                                      <span>•</span>
                                      <span>Nodes: {wf.nodes.length}</span>
                                      <span>•</span>
                                      <span>{t.workflows.updated}: {new Date(wf.updatedAt).toLocaleDateString()}</span>
                                  </div>
                              </div>
                          </div>
                          <div className="flex items-center gap-3">
                              <button 
                                onClick={() => handleEditWorkflow(wf)} 
                                className="px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-textMain hover:border-primary hover:text-primary transition-all"
                              >
                                  {t.actions.edit}
                              </button>
                              <button className="p-2 text-textSecondary hover:text-red-500 hover:bg-background rounded-lg transition-colors">
                                  <Trash2 size={18} />
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      );
  };

  // ... (Modals: SquadEditModal, TemplateEditModal, AssignSquadModal, renderKnowledgeBase, renderOnboardingConfig) ...
  // All other components remain identical, just ensuring full file integrity.

  const SquadEditModal = () => {
    if (!editingSquad) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface border border-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-border flex justify-between items-center">
                    <h3 className="text-xl font-bold text-textMain">{t.squads.editTitle}</h3>
                    <button onClick={() => setEditingSquad(null)}><X size={24} className="text-textSecondary hover:text-textMain"/></button>
                </div>
                <div className="p-6 space-y-6 overflow-y-auto">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-textSecondary uppercase">{t.squads.nameLabel}</label>
                        <input type="text" value={editingSquad.name} onChange={e => setEditingSquad({...editingSquad, name: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-textSecondary uppercase">{t.squads.descLabel}</label>
                        <input type="text" value={editingSquad.description} onChange={e => setEditingSquad({...editingSquad, description: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-textSecondary uppercase">{t.squads.membersLabel}</label>
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto bg-background/50 p-2 rounded-lg border border-border">
                            {agents.map(agent => (
                                <button
                                    key={agent.id}
                                    onClick={() => {
                                        const current = editingSquad.memberAgentIds;
                                        const next = current.includes(agent.id) 
                                            ? current.filter(id => id !== agent.id)
                                            : [...current, agent.id];
                                        setEditingSquad({...editingSquad, memberAgentIds: next});
                                    }}
                                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${editingSquad.memberAgentIds.includes(agent.id) ? 'bg-primary/10 border-primary' : 'bg-surface border-border hover:border-primary/50'}`}
                                >
                                    <div className={`w-4 h-4 rounded flex items-center justify-center border ${editingSquad.memberAgentIds.includes(agent.id) ? 'bg-primary border-primary text-white' : 'bg-background border-border text-transparent'}`}>
                                        <CheckCircle size={10} fill="currentColor" className={editingSquad.memberAgentIds.includes(agent.id) ? 'block' : 'hidden'}/>
                                    </div>
                                    <span className="text-xs font-bold text-textMain truncate">{agent.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-border bg-background/50 flex justify-end gap-3">
                     <button onClick={() => setEditingSquad(null)} className="px-4 py-2 text-textSecondary hover:bg-surface rounded-lg text-sm">{tCommon.cancel}</button>
                     <button onClick={() => handleSaveSquad(editingSquad)} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110">{tCommon.save}</button>
                </div>
            </div>
        </div>
    );
  };

  const TemplateEditModal = () => {
    if (!editingTemplate) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
        <div className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl flex flex-col">
          <div className="p-5 border-b border-border flex justify-between items-center">
            <h3 className="text-xl font-bold text-textMain">{t.templates.editTitle}</h3>
            <button onClick={() => setEditingTemplate(null)}><X size={24} className="text-textSecondary hover:text-textMain"/></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-textSecondary uppercase">{t.templates.labelLabel}</label>
              <input type="text" value={editingTemplate.label} onChange={e => setEditingTemplate({...editingTemplate, label: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none" />
              <p className="text-[10px] text-textSecondary">{t.templates.labelDesc}</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-textSecondary uppercase">{t.templates.promptLabel}</label>
              <textarea value={editingTemplate.prompt} onChange={e => setEditingTemplate({...editingTemplate, prompt: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none h-32 resize-none" />
              <p className="text-[10px] text-textSecondary">{t.templates.promptDesc}</p>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-textSecondary uppercase">{t.templates.iconLabel}</label>
                <select value={editingTemplate.icon} onChange={e => setEditingTemplate({...editingTemplate, icon: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none">
                    <option value="Zap">Zap</option>
                    <option value="PenTool">PenTool</option>
                    <option value="Mail">Mail</option>
                    <option value="BarChart">BarChart</option>
                    <option value="Cpu">Cpu</option>
                </select>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-textSecondary uppercase">{t.templates.targetAgentLabel}</label>
                <select value={editingTemplate.targetAgentId || ''} onChange={e => setEditingTemplate({...editingTemplate, targetAgentId: e.target.value || undefined})} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-textMain focus:border-primary outline-none">
                    <option value="">{t.templates.auto}</option>
                    {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>
          </div>
          <div className="p-4 border-t border-border bg-background/50 flex justify-end gap-3">
             <button onClick={() => setEditingTemplate(null)} className="px-4 py-2 text-textSecondary hover:bg-surface rounded-lg text-sm">{tCommon.cancel}</button>
             <button onClick={() => handleSaveTemplate(editingTemplate)} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110">{tCommon.save}</button>
          </div>
        </div>
      </div>
    );
  };

  const AssignSquadModal = () => {
    if (!assigningSquad) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface border border-border rounded-xl w-full max-w-3xl shadow-2xl flex flex-col h-[80vh]">
                <div className="p-5 border-b border-border flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-textMain">{t.squads.assignTitle}</h3>
                        <p className="text-xs text-textSecondary">{assigningSquad.name}</p>
                    </div>
                    <button onClick={() => setAssigningSquad(null)}><X size={24} className="text-textSecondary hover:text-textMain"/></button>
                </div>
                <div className="p-3 border-b border-border bg-background/50 flex items-center justify-between">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary" size={14} />
                        <input 
                            type="text" 
                            placeholder={t.searchUser} 
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            className="bg-surface border border-border rounded-lg pl-9 pr-3 py-1.5 text-sm text-textMain focus:border-primary outline-none"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => toggleSelectAllUsers(true)} className="px-3 py-1.5 text-xs bg-surface border border-border rounded hover:bg-background text-textMain">Select All</button>
                        <button onClick={() => toggleSelectAllUsers(false)} className="px-3 py-1.5 text-xs bg-surface border border-border rounded hover:bg-background text-textMain">Deselect All</button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredUsers.map(u => {
                        const isAssigned = assigningSquad.assignedToUserIds?.includes(u.id);
                        return (
                            <div 
                                key={u.id}
                                onClick={() => {
                                    const current = assigningSquad.assignedToUserIds || [];
                                    const next = isAssigned ? current.filter(id => id !== u.id) : [...current, u.id];
                                    setAssigningSquad({...assigningSquad, assignedToUserIds: next});
                                }}
                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isAssigned ? 'bg-primary/10 border-primary ring-1 ring-primary' : 'bg-surface border-border hover:border-primary/50'}`}
                            >
                                <div className={`w-5 h-5 rounded flex items-center justify-center border ${isAssigned ? 'bg-primary border-primary text-white' : 'bg-background border-border text-transparent'}`}>
                                    <CheckCircle size={12} fill="currentColor" className={isAssigned ? 'block' : 'hidden'}/>
                                </div>
                                <img src={u.avatar} className="w-8 h-8 rounded-full bg-background" alt=""/>
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-textMain truncate">{u.name}</div>
                                    <div className="text-xs text-textSecondary truncate">{u.email}</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div className="p-4 border-t border-border bg-surface flex justify-end gap-3">
                    <button onClick={() => setAssigningSquad(null)} className="px-4 py-2 text-textSecondary hover:bg-background rounded-lg text-sm">{tCommon.cancel}</button>
                    <button onClick={() => handleSaveSquad(assigningSquad)} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110">{tCommon.save}</button>
                </div>
            </div>
        </div>
    );
  };

  const renderKnowledgeBase = () => (
      <div className="space-y-6 w-full">
          <div className="flex justify-between items-center">
              <div>
                  <h3 className="font-bold text-textMain">Global Knowledge Base</h3>
                  <p className="text-xs text-textSecondary">Files uploaded here are accessible to all agents via RAG.</p>
              </div>
              <button className="flex items-center gap-2 bg-surface hover:bg-background border border-border px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  <Upload size={16}/> Upload Document
              </button>
          </div>
          
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm text-textMain">
                  <thead className="bg-background text-xs uppercase font-medium text-textSecondary">
                      <tr>
                          <th className="px-6 py-3">File Name</th>
                          <th className="px-6 py-3">Size</th>
                          <th className="px-6 py-3">Uploaded</th>
                          <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                      {systemFiles.map((file, i) => (
                          <tr key={i} className="hover:bg-background/50 transition-colors">
                              <td className="px-6 py-4 flex items-center gap-3">
                                  <FileText size={18} className="text-primary"/>
                                  <span className="font-medium">{file.name}</span>
                              </td>
                              <td className="px-6 py-4 text-textSecondary font-mono text-xs">{file.size}</td>
                              <td className="px-6 py-4 text-textSecondary text-xs">{file.date}</td>
                              <td className="px-6 py-4 text-right">
                                  <button onClick={() => setSystemFiles(prev => prev.filter(f => f.name !== file.name))} className="text-textSecondary hover:text-red-500 p-1 rounded hover:bg-background"><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
  );

  const renderOnboardingConfig = () => (
      <div className="space-y-6 w-full">
           <div className="flex justify-between items-center">
              <div>
                  <h3 className="font-bold text-textMain">{t.onboardingSettings.title}</h3>
                  <p className="text-xs text-textSecondary">{t.onboardingSettings.subtitle}</p>
              </div>
              <div className="flex gap-2">
                   <button 
                        onClick={() => setIsDragEnabled(!isDragEnabled)} 
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${isDragEnabled ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-textSecondary'}`}
                   >
                       {isDragEnabled ? <CheckSquare size={14}/> : <GripVertical size={14}/>} Reorder
                   </button>
                   <button onClick={addField} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110">
                        <Plus size={16} /> {t.onboardingSettings.addField}
                   </button>
              </div>
          </div>
          <div className="space-y-3">
              {onboardingConfig.map((field, index) => (
                  <div 
                    key={field.id} 
                    className={`bg-surface border border-border rounded-xl p-4 flex gap-4 items-start group transition-all ${isDragEnabled ? 'cursor-move hover:border-accent border-dashed' : ''} ${draggedIndex === index ? 'opacity-50' : ''}`}
                    draggable={isDragEnabled}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                      {/* ... Drag icon ... */}
                      {isDragEnabled && (
                          <div className="mt-3 text-textSecondary">
                              <GripVertical size={20} />
                          </div>
                      )}
                      {/* Form Content */}
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
                          <div className="md:col-span-4">
                              <label className="text-[10px] font-bold text-textSecondary uppercase block mb-1">{t.onboardingSettings.fieldLabel}</label>
                              <input 
                                type="text" 
                                value={field.label} 
                                onChange={(e) => updateField(field.id, { label: e.target.value })}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                              />
                          </div>
                          <div className="md:col-span-3">
                              <label className="text-[10px] font-bold text-textSecondary uppercase block mb-1">{t.onboardingSettings.fieldName}</label>
                              <input 
                                type="text" 
                                value={field.key} 
                                onChange={(e) => updateField(field.id, { key: e.target.value })}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain font-mono focus:border-primary outline-none"
                              />
                          </div>
                          <div className="md:col-span-3">
                              <label className="text-[10px] font-bold text-textSecondary uppercase block mb-1">{t.onboardingSettings.fieldType}</label>
                              <select 
                                value={field.type} 
                                onChange={(e) => updateField(field.id, { type: e.target.value as FormFieldType })}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                              >
                                  <option value="text">{t.onboardingSettings.typeOptions.text}</option>
                                  <option value="textarea">{t.onboardingSettings.typeOptions.textarea}</option>
                                  <option value="number">{t.onboardingSettings.typeOptions.number}</option>
                                  <option value="select">{t.onboardingSettings.typeOptions.select}</option>
                                  <option value="file">{t.onboardingSettings.typeOptions.file}</option>
                              </select>
                          </div>
                          <div className="md:col-span-2 flex items-center gap-2 pt-6">
                              <button 
                                onClick={() => updateField(field.id, { required: !field.required })}
                                className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${field.required ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-background border-border text-textSecondary'}`}
                              >
                                  {field.required ? 'Required' : 'Optional'}
                              </button>
                              <button onClick={() => removeField(field.id)} className="p-2 text-textSecondary hover:text-red-500 hover:bg-background rounded-lg transition-colors ml-auto">
                                  <Trash2 size={16} />
                              </button>
                          </div>
                          
                          {field.type === 'select' && (
                              <div className="md:col-span-12">
                                  <label className="text-[10px] font-bold text-textSecondary uppercase block mb-1">{t.onboardingSettings.options}</label>
                                  <input 
                                    type="text" 
                                    value={field.options?.join(', ') || ''} 
                                    onChange={(e) => updateField(field.id, { options: e.target.value.split(',').map(s => s.trim()) })}
                                    placeholder="Option 1, Option 2, Option 3"
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"
                                  />
                              </div>
                          )}
                      </div>
                  </div>
              ))}
          </div>
      </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-full bg-background overflow-hidden">
      {assigningSquad && <AssignSquadModal />}
      {editingUser && (
          <UserEditModal 
            user={editingUser} 
            onClose={() => setEditingUser(null)} 
            onSave={handleSaveUser} 
            language={language}
            onboardingConfig={onboardingConfig}
          />
      )}
      
      {editingAgent && (
          <AgentEditModal 
            agent={editingAgent} 
            onClose={() => setEditingAgent(null)} 
            onSave={handleSaveAgent} 
            language={language}
            availableCategories={agentCategories}
          />
      )}
      
      {editingTemplate && <TemplateEditModal />}
      {editingSquad && <SquadEditModal />}

      <div className="flex-1 flex flex-col w-full h-full overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-background">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-textMain flex items-center gap-3 mb-1">
                <Shield className="text-primary" size={28} />
                {t.title}
              </h1>
              <p className="text-sm text-textSecondary">
                {language === 'zh' ? '系统管理控制台' : 'System Management Console'}
              </p>
            </div>
            {/* System Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-sm text-green-500">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>{language === 'zh' ? '系统运行正常' : 'System Operational'}</span>
            </div>
          </div>
        </div>

        {/* Content Area - Full Screen */}
        <div className="flex-1 overflow-y-auto scrollbar-hide bg-background w-full">
          <div className="p-4 w-full h-full">
            {activeTab === 'analytics' && renderAnalytics()}
            {activeTab === 'users' && renderUserTable()}
            {activeTab === 'agents' && renderAgentList()}
            {activeTab === 'squads' && renderSquads()}
            {activeTab === 'knowledge' && renderKnowledgeBase()}
            {activeTab === 'templates' && renderTemplates()}
            {activeTab === 'settings' && (
              <SettingsTab 
                language={language} 
                agentCategories={agentCategories}
                onUpdateCategories={handleUpdateCategories}
                onToggleTrendAnalysis={onToggleTrendAnalysis}
                onToggleStylePrompt={onToggleStylePrompt}
                onToggleSimulator={onToggleSimulator}
                onToggleGoalLanding={onToggleGoalLanding}
              />
            )}
            {activeTab === 'workflows' && renderWorkflows()}
            {activeTab === 'onboarding' && renderOnboardingConfig()}
            {activeTab === 'audit' && renderAuditLogs()}
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================
  // 数据分析仪表板
  // ============================================
  function renderAnalytics() {
    if (analyticsLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }

    const data = analyticsData || {
      users: { total: 0, active: 0, newThisWeek: 0, activeToday: 0 },
      agents: { total: 0, public: 0, newThisWeek: 0 },
      messages: { total: 0, today: 0, thisWeek: 0 },
      revenue: { total: 0, thisMonth: 0, thisWeek: 0 },
      systemHealth: { status: 'unknown', uptime: 0 },
    };

    const formatUptime = (seconds: number) => {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      return `${days}d ${hours}h`;
    };

    // Mock chart data
    const chartData = [
      { name: language === 'zh' ? '周一' : 'Mon', users: 45, messages: 320, revenue: 120 },
      { name: language === 'zh' ? '周二' : 'Tue', users: 52, messages: 380, revenue: 150 },
      { name: language === 'zh' ? '周三' : 'Wed', users: 48, messages: 290, revenue: 80 },
      { name: language === 'zh' ? '周四' : 'Thu', users: 61, messages: 420, revenue: 200 },
      { name: language === 'zh' ? '周五' : 'Fri', users: 55, messages: 350, revenue: 170 },
      { name: language === 'zh' ? '周六' : 'Sat', users: 38, messages: 250, revenue: 90 },
      { name: language === 'zh' ? '周日' : 'Sun', users: 42, messages: 280, revenue: 110 },
    ];

    return (
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Users */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <span className="flex items-center text-xs text-green-500">
                <ArrowUpRight size={14} />
                +{data.users.newThisWeek}
              </span>
            </div>
            <p className="text-2xl font-bold text-textMain">{data.users.total.toLocaleString()}</p>
            <p className="text-sm text-textSecondary">{language === 'zh' ? '总用户数' : 'Total Users'}</p>
            <div className="mt-2 text-xs text-textSecondary">
              {language === 'zh' ? '今日活跃' : 'Active today'}: <span className="text-textMain">{data.users.activeToday}</span>
            </div>
          </div>

          {/* Agents */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-500" />
              </div>
              <span className="flex items-center text-xs text-green-500">
                <ArrowUpRight size={14} />
                +{data.agents.newThisWeek}
              </span>
            </div>
            <p className="text-2xl font-bold text-textMain">{data.agents.total}</p>
            <p className="text-sm text-textSecondary">{language === 'zh' ? '智能体数量' : 'Total Agents'}</p>
            <div className="mt-2 text-xs text-textSecondary">
              {language === 'zh' ? '公开' : 'Public'}: <span className="text-textMain">{data.agents.public}</span>
            </div>
          </div>

          {/* Messages */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-green-500" />
              </div>
              <span className="flex items-center text-xs text-green-500">
                <Activity size={14} />
                {data.messages.today}
              </span>
            </div>
            <p className="text-2xl font-bold text-textMain">{data.messages.total.toLocaleString()}</p>
            <p className="text-sm text-textSecondary">{language === 'zh' ? '总消息数' : 'Total Messages'}</p>
            <div className="mt-2 text-xs text-textSecondary">
              {language === 'zh' ? '本周' : 'This week'}: <span className="text-textMain">{data.messages.thisWeek.toLocaleString()}</span>
            </div>
          </div>

          {/* Revenue */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-amber-500" />
              </div>
              <span className="flex items-center text-xs text-green-500">
                <TrendingUp size={14} />
                ${data.revenue.thisWeek.toFixed(0)}
              </span>
            </div>
            <p className="text-2xl font-bold text-textMain">${data.revenue.total.toLocaleString()}</p>
            <p className="text-sm text-textSecondary">{language === 'zh' ? '总收入' : 'Total Revenue'}</p>
            <div className="mt-2 text-xs text-textSecondary">
              {language === 'zh' ? '本月' : 'This month'}: <span className="text-textMain">${data.revenue.thisMonth.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Activity Chart */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-lg font-semibold text-textMain mb-4">
              {language === 'zh' ? '用户活跃趋势' : 'User Activity Trend'}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{fontSize: 12, fill: 'var(--color-text-secondary)'}} />
                  <YAxis tick={{fontSize: 12, fill: 'var(--color-text-secondary)'}} />
                  <Tooltip 
                    contentStyle={{backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px'}}
                    labelStyle={{color: 'var(--color-text-main)'}}
                  />
                  <Area type="monotone" dataKey="users" stroke="var(--color-primary)" fill="url(#colorUsers)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Messages Chart */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-lg font-semibold text-textMain mb-4">
              {language === 'zh' ? '消息量趋势' : 'Message Volume Trend'}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{fontSize: 12, fill: 'var(--color-text-secondary)'}} />
                  <YAxis tick={{fontSize: 12, fill: 'var(--color-text-secondary)'}} />
                  <Tooltip 
                    contentStyle={{backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px'}}
                    labelStyle={{color: 'var(--color-text-main)'}}
                  />
                  <Bar dataKey="messages" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-lg font-semibold text-textMain mb-4">
            {language === 'zh' ? '系统状态' : 'System Health'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
              <div className={`w-3 h-3 rounded-full ${data.systemHealth.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
              <div>
                <p className="text-sm font-medium text-textMain">{language === 'zh' ? '系统状态' : 'Status'}</p>
                <p className="text-xs text-textSecondary capitalize">{data.systemHealth.status}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
              <Clock className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-textMain">{language === 'zh' ? '运行时间' : 'Uptime'}</p>
                <p className="text-xs text-textSecondary">{formatUptime(data.systemHealth.uptime)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
              <Database className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium text-textMain">{language === 'zh' ? '数据库' : 'Database'}</p>
                <p className="text-xs text-textSecondary">PostgreSQL</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
              <Cpu className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-textMain">{language === 'zh' ? 'API服务' : 'API'}</p>
                <p className="text-xs text-textSecondary">Express.js</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // 审计日志
  // ============================================
  function renderAuditLogs() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-textMain">
            {language === 'zh' ? '审计日志' : 'Audit Logs'}
          </h2>
          <button 
            onClick={loadAuditLogs}
            className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm hover:bg-primary/20 transition-colors"
          >
            {language === 'zh' ? '刷新' : 'Refresh'}
          </button>
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {auditLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : auditLogs.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-background text-xs uppercase font-medium text-textSecondary">
                <tr>
                  <th className="px-4 py-3">{language === 'zh' ? '时间' : 'Time'}</th>
                  <th className="px-4 py-3">{language === 'zh' ? '用户' : 'User'}</th>
                  <th className="px-4 py-3">{language === 'zh' ? '操作' : 'Action'}</th>
                  <th className="px-4 py-3">{language === 'zh' ? '资源' : 'Resource'}</th>
                  <th className="px-4 py-3">{language === 'zh' ? 'IP' : 'IP'}</th>
                  <th className="px-4 py-3">{language === 'zh' ? '状态' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-background/50 transition-colors">
                    <td className="px-4 py-3 text-textSecondary text-xs">
                      {new Date(log.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-textMain text-sm">{log.userName || 'Unknown'}</p>
                        <p className="text-textSecondary text-xs">{log.userEmail}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        log.action === 'CREATE' ? 'bg-green-500/10 text-green-500' :
                        log.action === 'UPDATE' ? 'bg-blue-500/10 text-blue-500' :
                        log.action === 'DELETE' ? 'bg-red-500/10 text-red-500' :
                        'bg-gray-500/10 text-gray-500'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-textMain">
                      {log.resource}
                      {log.resourceId && <span className="text-textSecondary ml-1">#{log.resourceId.slice(0, 8)}</span>}
                    </td>
                    <td className="px-4 py-3 text-textSecondary text-xs font-mono">
                      {log.ip || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {log.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-textSecondary">
              <FileText className="w-12 h-12 mb-3 opacity-50" />
              <p>{language === 'zh' ? '暂无审计日志' : 'No audit logs yet'}</p>
            </div>
          )}

          {/* Pagination */}
          {auditTotal > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-textSecondary">
                {language === 'zh' ? `共 ${auditTotal} 条` : `Total ${auditTotal} records`}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                  disabled={auditPage === 1}
                  className="px-3 py-1 text-sm bg-background rounded-lg disabled:opacity-50"
                >
                  {language === 'zh' ? '上一页' : 'Previous'}
                </button>
                <span className="px-3 py-1 text-sm text-textSecondary">
                  {auditPage} / {Math.ceil(auditTotal / 20)}
                </span>
                <button
                  onClick={() => setAuditPage(p => p + 1)}
                  disabled={auditPage >= Math.ceil(auditTotal / 20)}
                  className="px-3 py-1 text-sm bg-background rounded-lg disabled:opacity-50"
                >
                  {language === 'zh' ? '下一页' : 'Next'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
};

export default AdminDashboard;
