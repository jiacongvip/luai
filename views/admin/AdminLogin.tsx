import React, { useState } from 'react';
import { Shield, ArrowRight, Lock, Mail, User } from 'lucide-react';
import { User as UserType, Language } from '../../types';
import { translations } from '../../utils/translations';
import { api, setAuthToken } from '../../utils/api';

interface AdminLoginProps {
  onLogin: (user: UserType) => void;
  language: Language;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin, language }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const t = translations[language]?.common || translations['en'].common;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const response = await api.auth.login(email, password);
      if (response.user) {
        // 验证是否为管理员
        if (response.user.role !== 'admin') {
          setError(language === 'zh' ? '此账户不是管理员账户' : 'This account is not an admin account');
          setIsLoading(false);
          return;
        }
        onLogin(response.user);
      }
    } catch (error: any) {
      setError(error.message || (language === 'zh' ? '登录失败，请检查您的凭据' : 'Login failed. Please check your credentials.'));
      setIsLoading(false);
    }
  };

  const fillAdminAccount = () => {
    setEmail('admin@admin.com');
    setPassword('111111');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] relative overflow-hidden font-sans">
      
      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] animate-pulse-slow"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/20 rounded-full blur-[120px] animate-pulse-slow" style={{animationDelay: '1s'}}></div>

      <div className="w-full max-w-md p-8 relative z-10 animate-slide-up">
        
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/30 ring-1 ring-white/20 mb-6">
                <Shield className="text-white w-10 h-10 fill-white" />
            </div>
            <h1 className="text-4xl font-bold text-white tracking-tight mb-2 text-center">
              {language === 'zh' ? '管理后台' : 'Admin Panel'}
            </h1>
            <p className="text-slate-400 text-center text-sm">
              {language === 'zh' ? 'Nexus AI 管理控制台' : 'Nexus AI Admin Console'}
            </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Email</label>
                    <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                        <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@nexus.ai"
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                            required
                        />
                    </div>
                </div>
                
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Password</label>
                    <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                            required
                        />
                    </div>
                </div>

                {/* 快速填入管理员账号按钮 */}
                <button 
                    type="button"
                    onClick={fillAdminAccount}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm group"
                >
                    <User size={16} className="group-hover:scale-110 transition-transform" />
                    {language === 'zh' ? '快速填入管理员账号' : 'Fill Admin Account'}
                </button>

                <button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2 mt-4 group"
                >
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                        <>
                            {language === 'zh' ? '管理员登录' : 'Admin Login'}
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </button>
            </form>

            <div className="mt-6 text-center">
                <a 
                    href="/login" 
                    className="text-sm text-slate-400 hover:text-primary transition-colors"
                >
                    {language === 'zh' ? '返回用户登录' : 'Back to User Login'}
                </a>
            </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-8">
            {language === 'zh' 
              ? '仅限授权管理员访问' 
              : 'Authorized administrators only'}
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;

