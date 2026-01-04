
import React, { useState } from 'react';
import { ArrowRight, Sparkles, Target, Loader2, Users, FileText } from 'lucide-react';
import { Language, Agent } from '../types';
import { translations } from '../utils/translations';
import { orchestrateGoal } from '../services/geminiService';

interface GoalLandingProps {
    language: Language;
    agents: Agent[];
    onGoalSubmit: (title: string, agentIds: string[], initialPlan: string) => void;
}

const GoalLanding: React.FC<GoalLandingProps> = ({ language, agents, onGoalSubmit }) => {
    // Safe translation access
    const t = (translations[language] as any)?.home || (translations['en'] as any).home;
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusStep, setStatusStep] = useState(0);

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim()) return;

        setIsProcessing(true);
        
        // Simulated Status Updates
        setStatusStep(1); // Analyzing
        const timer1 = setTimeout(() => setStatusStep(2), 1500); // Recruiting
        const timer2 = setTimeout(() => setStatusStep(3), 3000); // Drafting

        try {
            const result = await orchestrateGoal(input, agents, language);
            
            if (result) {
                // Validate agent IDs
                const validAgentIds = result.agentIds.filter(id => agents.some(a => a.id === id));
                // Ensure at least one agent (fallback to Orchestrator 'a1' if logic failed)
                const finalAgentIds = validAgentIds.length > 0 ? validAgentIds : ['a1'];
                
                setStatusStep(4); // Launching
                setTimeout(() => {
                    onGoalSubmit(result.title, finalAgentIds, result.initialPlan);
                }, 800);
            } else {
                // Fallback if AI fails
                onGoalSubmit(language === 'zh' ? '新任务' : 'New Goal', ['a1'], language === 'zh' ? '无法自动生成计划，请直接告诉我您的需求。' : 'Could not generate plan automatically. Please tell me more.');
            }
        } catch (e) {
            console.error(e);
            onGoalSubmit(language === 'zh' ? '新任务' : 'New Goal', ['a1'], '');
        } finally {
            // Cleanup timers if API returns fast
            clearTimeout(timer1);
            clearTimeout(timer2);
        }
    };

    const steps = [
        { label: t.analyzingGoal, icon: Target },
        { label: t.recruiting, icon: Users },
        { label: t.draftingPlan, icon: FileText },
        { label: t.launching, icon: Sparkles },
    ];

    const quickStarts = [
        language === 'zh' ? "策划一场双11促销活动" : "Plan a Black Friday marketing campaign",
        language === 'zh' ? "为我的SaaS产品写这周的推文" : "Write social media posts for my SaaS product",
        language === 'zh' ? "分析这份财报并给出投资建议" : "Analyze this financial report for insights",
        language === 'zh' ? "设计一个Python爬虫架构" : "Design a Python web scraper architecture"
    ];

    return (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
            
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[20%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] animate-pulse-slow"></div>
                <div className="absolute bottom-[-10%] right-[20%] w-[30%] h-[30%] bg-accent/5 rounded-full blur-[100px] animate-pulse-slow" style={{animationDelay: '1.5s'}}></div>
            </div>

            <div className="max-w-3xl w-full z-10 flex flex-col items-center text-center">
                
                {/* Hero Icon */}
                <div className="mb-8 relative">
                    <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
                    <div className="w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center shadow-2xl relative z-10">
                        <Sparkles className="text-white w-10 h-10 fill-white/20" />
                    </div>
                </div>

                {/* Hero Text */}
                <h1 className="text-4xl md:text-5xl font-bold text-textMain mb-4 tracking-tight animate-slide-up">
                    {t.heroTitle}
                </h1>
                
                {/* Input Area */}
                <div className="w-full max-w-2xl relative mt-8 animate-slide-up" style={{animationDelay: '0.1s'}}>
                    {isProcessing ? (
                        <div className="bg-surface border border-border rounded-2xl p-8 shadow-xl flex flex-col items-center min-h-[200px] justify-center">
                            <div className="flex gap-4 mb-6">
                                {steps.map((step, idx) => {
                                    const isActive = statusStep === idx + 1;
                                    const isDone = statusStep > idx + 1;
                                    return (
                                        <div key={idx} className={`flex flex-col items-center gap-2 transition-all duration-500 ${isActive || isDone ? 'opacity-100 scale-100' : 'opacity-30 scale-90'}`}>
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors
                                                ${isActive ? 'border-primary text-primary bg-primary/10' : 
                                                  isDone ? 'border-green-500 text-white bg-green-500' : 
                                                  'border-border text-textSecondary'}`}>
                                                <step.icon size={18} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <h3 className="text-xl font-bold text-textMain flex items-center gap-3">
                                <Loader2 size={24} className="animate-spin text-primary"/>
                                {steps[Math.max(0, statusStep - 1)]?.label || t.orchestrating}
                            </h3>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="relative group">
                            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl blur-md group-hover:blur-lg transition-all opacity-50 group-hover:opacity-100"></div>
                            <div className="relative bg-surface border border-border rounded-2xl shadow-2xl flex items-center p-2 focus-within:border-primary/50 transition-all">
                                <input 
                                    type="text" 
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder={t.heroPlaceholder}
                                    className="flex-1 bg-transparent border-none text-lg px-6 py-4 text-textMain placeholder-textSecondary/50 focus:ring-0 outline-none"
                                    autoFocus
                                />
                                <button 
                                    type="submit"
                                    disabled={!input.trim()}
                                    className="p-3 bg-primary hover:bg-primary-hover text-white rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95 m-1"
                                >
                                    <ArrowRight size={24} />
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* Quick Starts */}
                {!isProcessing && (
                    <div className="mt-12 animate-slide-up" style={{animationDelay: '0.2s'}}>
                        <p className="text-xs font-bold text-textSecondary uppercase tracking-widest mb-4">{t.quickStarts}</p>
                        <div className="flex flex-wrap justify-center gap-3">
                            {quickStarts.map((qs, i) => (
                                <button 
                                    key={i}
                                    onClick={() => { setInput(qs); handleSubmit(); }} // Trigger immediately or just set input? Let's verify.
                                    // Actually better to just set input and let user submit, OR submit directly. Let's submit directly for "Quick" start.
                                    className="px-4 py-2 bg-surface hover:bg-background border border-border rounded-full text-sm text-textSecondary hover:text-textMain hover:border-primary/30 transition-all cursor-pointer"
                                >
                                    {qs}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default GoalLanding;
