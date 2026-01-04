
import React, { useState } from 'react';
import { Zap, ArrowRight, Lock, Mail, Github, Chrome, User } from 'lucide-react';
import { User as UserType, Language } from '../types';
import { translations } from '../utils/translations';
import { api, setAuthToken } from '../utils/api';

interface AuthProps {
  onLogin: (user: UserType) => void;
  language: Language;
}

const Auth: React.FC<AuthProps> = ({ onLogin, language }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Safe Translation Access
  const t = translations[language]?.common || translations['en'].common;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const response = await api.auth.login(email, password);
      if (response.user) {
        onLogin(response.user);
      }
    } catch (error: any) {
      alert(error.message || 'Login failed. Please check your credentials.');
      setIsLoading(false);
    }
  };

  const fillTestAccount = () => {
    setEmail('test@test.com');
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
                <Zap className="text-white w-10 h-10 fill-white" />
            </div>
            <h1 className="text-4xl font-bold text-white tracking-tight mb-2 text-center">Nexus AI</h1>
            <p className="text-slate-400 text-center text-sm">Enterprise Multi-Agent Orchestration Platform</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Email</label>
                    <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                        <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="demo@nexus.ai"
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
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
                        />
                    </div>
                </div>

                {/* 快速填入测试账号按钮 */}
                <button 
                    type="button"
                    onClick={fillTestAccount}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm group"
                >
                    <User size={16} className="group-hover:scale-110 transition-transform" />
                    {language === 'zh' ? '快速填入测试账号' : 'Fill Test Account'}
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
                            {t.login}
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </button>
            </form>

            <div className="my-6 flex items-center gap-4">
                <div className="h-px bg-white/10 flex-1"></div>
                <span className="text-xs text-slate-500 uppercase font-bold">Or continue with</span>
                <div className="h-px bg-white/10 flex-1"></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <button type="button" className="flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 transition-colors">
                    <Github size={18} />
                    <span className="text-sm font-medium">GitHub</span>
                </button>
                <button type="button" className="flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 transition-colors">
                    <Chrome size={18} />
                    <span className="text-sm font-medium">Google</span>
                </button>
            </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-8">
            By signing in, you agree to our <a href="#" className="text-primary hover:underline">Terms of Service</a> and <a href="#" className="text-primary hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
};

export default Auth;
