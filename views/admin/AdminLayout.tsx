import React, { useState } from 'react';
import { Shield, Menu, LogOut, Home, Users, Bot, Settings, Workflow as WorkflowIcon, ClipboardList, Lightbulb, Database, BarChart2, FileText } from 'lucide-react';
import { Language, User as UserType } from '../../types';
import { translations } from '../../utils/translations';
import { clearAuthToken } from '../../utils/api';

type AdminTab = 'analytics' | 'users' | 'agents' | 'squads' | 'settings' | 'workflows' | 'onboarding' | 'templates' | 'knowledge' | 'audit';

interface AdminLayoutProps {
  children: React.ReactNode;
  currentUser: UserType;
  language: Language;
  currentPath?: string;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
  activeTab?: AdminTab;
  onTabChange?: (tab: AdminTab) => void;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ 
  children, 
  currentUser, 
  language,
  currentPath = '/admin/dashboard',
  onNavigate,
  onLogout,
  activeTab = 'analytics',
  onTabChange
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const t = translations[language]?.admin || translations['en'].admin;

  const tabs = [
    { id: 'analytics' as AdminTab, label: language === 'zh' ? '数据概览' : 'Analytics', icon: BarChart2 },
    { id: 'users' as AdminTab, label: t.tabs.users, icon: Users },
    { id: 'agents' as AdminTab, label: t.tabs.agents, icon: Bot },
    { id: 'squads' as AdminTab, label: t.tabs.squads, icon: Users },
    { id: 'workflows' as AdminTab, label: t.tabs.workflows, icon: WorkflowIcon },
    { id: 'templates' as AdminTab, label: t.tabs.templates, icon: Lightbulb },
    { id: 'knowledge' as AdminTab, label: t.tabs.knowledge, icon: Database },
    { id: 'onboarding' as AdminTab, label: t.tabs.onboarding, icon: ClipboardList },
    { id: 'settings' as AdminTab, label: t.tabs.settings, icon: Settings },
    { id: 'audit' as AdminTab, label: language === 'zh' ? '审计日志' : 'Audit Logs', icon: FileText }
  ];

  const handleLogout = () => {
    clearAuthToken();
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = '/admin/login';
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden text-textMain font-sans">
      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-56 bg-surface border-r border-border transition-transform duration-200 flex-shrink-0 ${
        isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
                <Shield className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-textMain text-lg">
                  {language === 'zh' ? '管理后台' : 'Admin Panel'}
                </h1>
                <p className="text-xs text-textSecondary">
                  {language === 'zh' ? 'Nexus AI' : 'Nexus AI'}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (onTabChange) {
                      onTabChange(tab.id);
                    }
                    setIsMobileOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/30 shadow-sm'
                      : 'text-textSecondary hover:bg-background hover:text-textMain border border-transparent'
                  }`}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border space-y-3">
            <a
              href="/"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-textSecondary hover:bg-background hover:text-textMain transition-all text-sm"
            >
              <Home size={18} />
              <span className="font-medium">{language === 'zh' ? '返回用户端' : 'Back to User'}</span>
            </a>
            <div className="px-4 py-2 text-xs text-textSecondary border-t border-border pt-3">
              <div className="font-medium text-textMain mb-1">{currentUser.name}</div>
              <div className="text-xs">{currentUser.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-textSecondary hover:bg-red-500/20 hover:text-red-400 transition-all text-sm"
            >
              <LogOut size={18} />
              <span className="font-medium">{language === 'zh' ? '退出登录' : 'Logout'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-screen overflow-hidden min-w-0">
        {/* Mobile Header */}
        <div className="md:hidden flex-shrink-0 p-4 border-b border-border bg-surface flex items-center justify-between">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="p-2 hover:bg-background rounded-lg transition-colors"
          >
            <Menu size={20} />
          </button>
          <h2 className="font-bold text-textMain">
            {language === 'zh' ? '管理后台' : 'Admin Panel'}
          </h2>
          <div className="w-10" />
        </div>

        {/* Content - Full Height */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

