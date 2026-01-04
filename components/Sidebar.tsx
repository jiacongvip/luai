
import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  LayoutGrid, 
  PlusCircle, 
  CreditCard, 
  LogOut, 
  Zap,
  Moon,
  Sun,
  Users,
  User as UserIcon,
  Key,
  ChevronRight,
  ClipboardList,
  Briefcase,
  ChevronDown,
  TrendingUp,
  LayoutTemplate,
  Home,
  Trash2
} from 'lucide-react';
import { AppRoute, User as UserType, ChatSession, Language, ThemeId, ThemeMode } from '../types';
import { translations } from '../utils/translations';
import { THEMES } from '../constants';

interface SidebarProps {
  currentUser: UserType;
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onCreateGroupSession: () => void;
  onDeleteSession?: (id: string) => void; // 删除会话回调
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  currentTheme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  onUpdateProject?: (projectId: string) => void; 
  showTrendAnalysis?: boolean;
  showSimulator?: boolean; // NEW
  showGoalLanding?: boolean; // NEW
  onLogout?: () => void; // 登出回调
}

const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  currentRoute,
  onNavigate,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onCreateGroupSession,
  onDeleteSession,
  isMobileOpen,
  setIsMobileOpen,
  language,
  setLanguage,
  currentTheme,
  setTheme,
  themeMode,
  setThemeMode,
  onUpdateProject,
  showTrendAnalysis = true,
  showSimulator = true, // NEW
  showGoalLanding = false, // NEW
  onLogout
}) => {
  // Safe Translation Access
  const t = translations[language]?.common || translations['en'].common;
  const tSim = (translations[language] as any)?.simulator || (translations['en'] as any).simulator;
  
  // Profile Menu State
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Project Menu State
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  const activeProject = currentUser.projects?.find(p => p.id === currentUser.activeProjectId);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
            setIsProfileMenuOpen(false);
        }
        if (projectMenuRef.current && !projectMenuRef.current.contains(event.target as Node)) {
            setIsProjectMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const navItems = [
    ...(showGoalLanding ? [{ icon: Home, label: t.home || 'Home', route: AppRoute.HOME }] : []),
    { icon: MessageSquare, label: t.chat, route: AppRoute.CHAT },
    { icon: LayoutGrid, label: t.agentPlaza, route: AppRoute.AGENTS },
    ...(showTrendAnalysis ? [{ icon: TrendingUp, label: t.trendAnalysis || 'Trends', route: AppRoute.TRENDS }] : []),
    ...(showSimulator ? [{ icon: LayoutTemplate, label: tSim?.title || 'RedNote Sim', route: AppRoute.SIMULATOR }] : []), // Added Simulator Toggle
  ];

  const bottomNavItems = [
    { icon: CreditCard, label: t.billing, route: AppRoute.BILLING },
    // 管理入口已移除 - 管理员通过 /admin 路径访问
  ];

  const sidebarClasses = `
    fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border 
    transform transition-transform duration-300 cubic-bezier(0.4, 0, 0.2, 1) flex flex-col
    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
  `;

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <div className={sidebarClasses}>
        {/* Header */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-white/10">
            <Zap className="text-white w-6 h-6 fill-white" />
          </div>
          <div>
             <h1 className="font-bold text-xl text-textMain tracking-tight font-display leading-none">{t.appName}</h1>
             <span className="text-[10px] text-textSecondary font-mono tracking-wider">v2.2.0</span>
          </div>
        </div>

        {/* Project Context Switcher */}
        <div className="px-4 mb-4 relative" ref={projectMenuRef}>
            <button 
                onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
                className="w-full bg-surface border border-border hover:border-primary/50 text-left px-3 py-2.5 rounded-xl flex items-center justify-between group transition-all"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1 bg-primary/10 rounded text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                        <Briefcase size={14} />
                    </div>
                    <div className="truncate">
                        <div className="text-[10px] font-bold text-textSecondary uppercase tracking-wider">{t.context || 'Context'}</div>
                        <div className="text-sm font-bold text-textMain truncate">{activeProject ? activeProject.name : (t.selectContext || 'Select Context')}</div>
                    </div>
                </div>
                <ChevronDown size={14} className="text-textSecondary group-hover:text-textMain"/>
            </button>

            {isProjectMenuOpen && (
                 <div className="absolute top-full left-4 right-4 mt-2 bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                     <div className="max-h-48 overflow-y-auto">
                        {(currentUser.projects || []).map(project => (
                             <button
                                key={project.id}
                                onClick={() => {
                                    onUpdateProject?.(project.id);
                                    setIsProjectMenuOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-background transition-colors
                                    ${currentUser.activeProjectId === project.id ? 'text-primary font-bold bg-primary/5' : 'text-textMain'}`}
                             >
                                 <Briefcase size={12} className={currentUser.activeProjectId === project.id ? 'text-primary' : 'text-textSecondary'} />
                                 <span className="truncate">{project.name}</span>
                             </button>
                        ))}
                     </div>
                     <div className="border-t border-border p-2 bg-background/50">
                         <button 
                            onClick={() => {
                                onNavigate(AppRoute.CONTEXT_MANAGER); // Updated Route
                                setIsProjectMenuOpen(false);
                            }}
                            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-primary hover:underline py-1"
                         >
                             <PlusCircle size={12} /> {t.manageContexts || 'Manage Contexts'}
                         </button>
                     </div>
                 </div>
            )}
        </div>

        {/* Action Buttons */}
        <div className="px-4 mb-2 flex gap-2">
          <button
            onClick={async () => {
              console.log('🖱️ New chat button clicked');
              try {
                await onCreateSession();
                console.log('✅ onCreateSession completed');
              } catch (error) {
                console.error('❌ onCreateSession error:', error);
              }
              if (window.innerWidth < 768) setIsMobileOpen(false);
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-surface hover:brightness-105 text-textMain py-3 px-2 rounded-xl transition-all duration-200 font-medium group border border-border shadow-sm text-sm"
          >
            <PlusCircle size={16} className="text-primary group-hover:scale-110 transition-transform duration-300" />
            <span>{t.newChat}</span>
          </button>
          
          <button
            onClick={() => {
              onCreateGroupSession();
              if (window.innerWidth < 768) setIsMobileOpen(false);
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-surface hover:brightness-105 text-textMain py-3 px-2 rounded-xl transition-all duration-200 font-medium group border border-border shadow-sm text-sm"
          >
            <Users size={16} className="text-accent group-hover:scale-110 transition-transform duration-300" />
            <span>{t.newGroup}</span>
          </button>
        </div>

        {/* Navigation */}
        <div className="px-2 space-y-0.5 mt-2">
          {navItems.map((item) => (
            <button
              key={item.route}
              onClick={() => {
                onNavigate(item.route);
                if (window.innerWidth < 768) setIsMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 font-medium
                ${currentRoute === item.route 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-textSecondary hover:bg-surface hover:text-textMain'}`}
            >
              <item.icon size={18} className={currentRoute === item.route ? 'text-primary' : 'opacity-70'} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-2 mt-4 space-y-0.5 scrollbar-hide py-2">
          <div className="px-4 py-2 text-[11px] font-bold text-textSecondary uppercase tracking-wider flex items-center justify-between">
            <span>{t.history}</span>
            <span className="bg-surface text-textSecondary rounded-full px-1.5 py-0.5 text-[9px] border border-border">{sessions.length}</span>
          </div>
          
          {sessions.length === 0 && (
            <div className="text-textSecondary text-xs px-4 py-4 text-center italic">
              {t.noChats}
            </div>
          )}
          
          {sessions.map((session) => (
            <div
              key={session.id}
              className="group relative"
            >
              <button
                onClick={() => {
                  onSelectSession(session.id);
                  onNavigate(AppRoute.CHAT);
                  if (window.innerWidth < 768) setIsMobileOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm truncate flex flex-col gap-0.5 transition-all duration-200 border border-transparent
                  ${activeSessionId === session.id && currentRoute === AppRoute.CHAT 
                    ? 'bg-surface text-textMain border-border shadow-sm' 
                    : 'text-textSecondary hover:bg-surface/50 hover:text-textMain'}`}
              >
                <div className="flex items-center gap-2">
                   {session.isGroup && <Users size={12} className="text-accent flex-shrink-0" />}
                   <span className="font-medium truncate block flex-1">{session.title}</span>
                </div>
                <span className="text-[11px] opacity-60 truncate font-light block">{session.lastMessage || t.emptyChat}</span>
              </button>
              {onDeleteSession && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(language === 'zh' ? '确定要删除这个对话吗？' : 'Are you sure you want to delete this conversation?')) {
                      onDeleteSession(session.id);
                    }
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-textSecondary hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                  title={language === 'zh' ? '删除对话' : 'Delete conversation'}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer / Settings */}
        <div className="p-4 border-t border-border bg-background space-y-4">
          
          {/* Theme & Language Controls */}
          <div className="flex items-center justify-between gap-2">
             {/* Theme Dots */}
             <div className="flex gap-1.5 p-1 bg-surface rounded-lg border border-border">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setTheme(theme.id)}
                    className={`w-4 h-4 rounded-md transition-all duration-300 ${currentTheme === theme.id ? 'scale-110 shadow-sm ring-1 ring-textMain/20' : 'opacity-40 hover:opacity-100'}`}
                    style={{ backgroundColor: theme.colors.primary }}
                    title={theme.name}
                  />
                ))}
             </div>
             
             {/* Dark/Light Toggle */}
             <button
                onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
                className="p-1.5 rounded-lg bg-surface border border-border text-textSecondary hover:text-textMain transition-colors"
                title="Toggle Dark/Light Mode"
             >
                {themeMode === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
             </button>

             {/* Language Toggle */}
             <div className="flex bg-surface rounded-lg p-0.5 border border-border">
                <button 
                  onClick={() => setLanguage('en')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${language === 'en' ? 'bg-primary text-white shadow-sm' : 'text-textSecondary hover:text-textMain'}`}
                >
                  EN
                </button>
                <button 
                  onClick={() => setLanguage('zh')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${language === 'zh' ? 'bg-primary text-white shadow-sm' : 'text-textSecondary hover:text-textMain'}`}
                >
                  中文
                </button>
             </div>
          </div>

          {/* Bottom Nav */}
          <div className="space-y-1">
             {bottomNavItems.map((item) => (
                <button
                key={item.route}
                onClick={() => {
                    onNavigate(item.route);
                    if (window.innerWidth < 768) setIsMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors
                    ${currentRoute === item.route ? 'text-primary bg-primary/5' : 'text-textSecondary hover:text-textMain hover:bg-surface'}`}
                >
                <item.icon size={16} />
                {item.label}
                </button>
             ))}
          </div>

          {/* User Profile Snippet (Clickable Menu) */}
          <div className="relative" ref={profileMenuRef}>
              
              {/* Popover Menu */}
              {isProfileMenuOpen && (
                  <div className="absolute bottom-full left-0 w-full mb-2 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden animate-slide-up origin-bottom">
                      <div className="p-2 space-y-0.5">
                          <button 
                             onClick={() => {
                                 onNavigate(AppRoute.CONTEXT_MANAGER); // Updated route
                                 setIsProfileMenuOpen(false);
                             }}
                             className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-textMain hover:bg-background transition-colors text-left"
                          >
                              <ClipboardList size={16} className="text-primary"/>
                              {t.profileMenu?.completeInfo || 'Context Library'}
                          </button>
                          <button 
                             className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-textMain hover:bg-background transition-colors text-left"
                             onClick={() => setIsProfileMenuOpen(false)}
                          >
                              <Key size={16} className="text-textSecondary"/>
                              {t.profileMenu?.changePassword || 'Change Password'}
                          </button>
                          <div className="h-px bg-border my-1 mx-2"></div>
                          <button 
                             className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-500 hover:bg-red-500/10 transition-colors text-left"
                             onClick={() => {
                               setIsProfileMenuOpen(false);
                               if (onLogout) {
                                 onLogout();
                               } else {
                                 // 如果没有提供 onLogout，使用默认行为
                                 localStorage.removeItem('auth_token');
                                 window.location.href = '/login';
                               }
                             }}
                          >
                              <LogOut size={16} />
                              {t.logout}
                          </button>
                      </div>
                  </div>
              )}

              <button 
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all border border-transparent
                   ${isProfileMenuOpen ? 'bg-surface border-border' : 'hover:bg-surface/50'}`}
              >
                <div className="w-8 h-8 rounded-full bg-surface overflow-hidden ring-2 ring-border">
                   <img src={currentUser.avatar} alt="User" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                   <div className="text-sm font-medium text-textMain truncate">{currentUser.name}</div>
                   <div className="text-xs text-primary font-mono">{currentUser.credits.toFixed(0)} Credits</div>
                </div>
                <ChevronRight size={14} className={`text-textSecondary transition-transform ${isProfileMenuOpen ? 'rotate-90' : ''}`} />
              </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
