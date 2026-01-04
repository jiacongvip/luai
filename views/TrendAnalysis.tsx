
import React, { useState, useEffect } from 'react';
import { Language } from '../types';
import { translations } from '../utils/translations';
import { analyzeDouyinAccount, DouyinAnalysisResult } from '../services/geminiService';
import { TrendingUp, Loader2, Target, Hash, Video, Copy, Zap, BarChart3, Link as LinkIcon, FileText, ChevronRight, Play } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface TrendAnalysisProps {
    language: Language;
}

const TrendAnalysis: React.FC<TrendAnalysisProps> = ({ language }) => {
    const t = (translations[language] as any)?.trends || (translations['en'] as any).trends;
    
    const [link, setLink] = useState('');
    const [input, setInput] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<DouyinAnalysisResult | null>(null);
    
    // UI States
    const [inputTab, setInputTab] = useState<'link' | 'text'>('link');
    const [resultTab, setResultTab] = useState<'hooks' | 'strategy' | 'script'>('hooks');

    // Persistence Key
    const STORAGE_KEY = 'nexus_trend_analysis_cache';

    // Load from storage on mount
    useEffect(() => {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setResult(parsed);
            } catch (e) {
                console.error("Failed to load cached trend analysis", e);
            }
        }
    }, []);

    const handleAnalyze = async () => {
        if (!input.trim() && !link.trim()) return;
        setIsAnalyzing(true);
        // Don't clear result immediately to prevent flickering if we want, but clearing implies new start
        // setResult(null); 
        try {
            const data = await analyzeDouyinAccount(link, input, language);
            if (data) {
                setResult(data);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        // Assuming simple alert is acceptable, or use a toast if available context allows
        // alert(language === 'zh' ? '已复制' : 'Copied');
    };

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden relative">
            {/* Background Ambience */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>
            
            {/* Header */}
            <div className="p-6 border-b border-border bg-surface/80 backdrop-blur-md z-10 flex-shrink-0">
                <div className="max-w-5xl mx-auto flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/20">
                        <TrendingUp size={20} className="text-white"/>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-textMain tracking-tight">{t.title}</h1>
                        <p className="text-textSecondary text-xs">{t.subtitle}</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                <div className="max-w-5xl mx-auto space-y-6">
                    
                    {/* Input Section - Tabbed Style */}
                    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
                        <div className="flex border-b border-border">
                            <button 
                                onClick={() => setInputTab('link')}
                                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${inputTab === 'link' ? 'bg-primary/5 text-primary border-b-2 border-primary' : 'text-textSecondary hover:bg-background hover:text-textMain'}`}
                            >
                                <LinkIcon size={14}/> {t.linkTitle}
                            </button>
                            <button 
                                onClick={() => setInputTab('text')}
                                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${inputTab === 'text' ? 'bg-primary/5 text-primary border-b-2 border-primary' : 'text-textSecondary hover:bg-background hover:text-textMain'}`}
                            >
                                <FileText size={14}/> {t.inputTitle}
                            </button>
                        </div>
                        
                        <div className="p-5">
                            {inputTab === 'link' ? (
                                <div className="animate-fade-in">
                                    <input 
                                        type="text" 
                                        value={link}
                                        onChange={(e) => setLink(e.target.value)}
                                        placeholder={t.linkPlaceholder}
                                        className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-textMain focus:border-primary outline-none font-mono transition-all focus:ring-1 focus:ring-primary/20"
                                    />
                                </div>
                            ) : (
                                <div className="animate-fade-in">
                                    <textarea 
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder={t.placeholder}
                                        className="w-full h-24 bg-background border border-border rounded-lg p-4 text-sm text-textMain focus:border-primary outline-none resize-none font-mono leading-relaxed transition-all focus:ring-1 focus:ring-primary/20"
                                    />
                                </div>
                            )}
                            
                            <div className="mt-4 flex justify-end">
                                <button 
                                    onClick={handleAnalyze}
                                    disabled={isAnalyzing || (inputTab === 'link' ? !link.trim() : !input.trim())}
                                    className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-bold shadow-lg shadow-primary/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-sm"
                                >
                                    {isAnalyzing ? <Loader2 size={16} className="animate-spin"/> : <Zap size={16}/>}
                                    {isAnalyzing ? t.analyzing : t.analyzeBtn}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Result Dashboard */}
                    {result && (
                        <div className="space-y-6 animate-slide-up">
                            
                            {/* Top Cards: Score & Keywords */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Score Card */}
                                <div className="bg-surface border border-border rounded-xl p-5 flex items-center gap-6 relative overflow-hidden shadow-sm">
                                    <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10"></div>
                                    <div className="relative w-24 h-24 flex-shrink-0">
                                        <svg className="w-full h-full -rotate-90">
                                            <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-background" />
                                            <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" 
                                                className={`text-primary transition-all duration-1000 ease-out`} 
                                                strokeDasharray={251} 
                                                strokeDashoffset={251 - (251 * result.score) / 100} 
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-2xl font-bold text-textMain">{result.score}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-textSecondary uppercase tracking-wider mb-1">{t.score}</div>
                                        <div className="text-lg font-bold text-primary mb-1">
                                            {result.score > 80 ? t.viralHigh || 'High Potential' : (result.score > 60 ? t.viralMedium || 'Medium Potential' : t.viralLow || 'Low Potential')}
                                        </div>
                                        <p className="text-[10px] text-textSecondary">Based on content patterns & trends</p>
                                    </div>
                                </div>

                                {/* Targeting Card */}
                                <div className="md:col-span-2 bg-surface border border-border rounded-xl p-5 flex flex-col justify-center shadow-sm">
                                    <div className="flex items-start gap-8 h-full">
                                        <div className="flex-1">
                                            <h3 className="text-xs font-bold text-textSecondary uppercase tracking-wider mb-3 flex items-center gap-2">
                                                <Target size={14} className="text-accent"/> {t.persona}
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {result.persona.map((tag, i) => (
                                                    <span key={i} className="px-2.5 py-1 bg-accent/10 border border-accent/20 text-accent rounded-md text-xs font-bold">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="w-px bg-border h-full mx-2"></div>
                                        <div className="flex-1">
                                            <h3 className="text-xs font-bold text-textSecondary uppercase tracking-wider mb-3 flex items-center gap-2">
                                                <Hash size={14} className="text-emerald-500"/> {t.keywords}
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {result.keywords.map((kw, i) => (
                                                    <span key={i} className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-md text-xs font-bold">
                                                        {kw}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Deep Dive Tabs */}
                            <div className="bg-surface border border-border rounded-xl shadow-lg overflow-hidden min-h-[400px] flex flex-col">
                                <div className="flex border-b border-border bg-background/50">
                                    <button 
                                        onClick={() => setResultTab('hooks')}
                                        className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${resultTab === 'hooks' ? 'bg-surface text-primary border-t-2 border-primary -mt-[2px]' : 'text-textSecondary hover:text-textMain hover:bg-surface/50'}`}
                                    >
                                        <Zap size={16}/> {t.hooks}
                                    </button>
                                    <button 
                                        onClick={() => setResultTab('strategy')}
                                        className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${resultTab === 'strategy' ? 'bg-surface text-primary border-t-2 border-primary -mt-[2px]' : 'text-textSecondary hover:text-textMain hover:bg-surface/50'}`}
                                    >
                                        <BarChart3 size={16}/> {t.strategy}
                                    </button>
                                    <button 
                                        onClick={() => setResultTab('script')}
                                        className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${resultTab === 'script' ? 'bg-surface text-primary border-t-2 border-primary -mt-[2px]' : 'text-textSecondary hover:text-textMain hover:bg-surface/50'}`}
                                    >
                                        <Video size={16}/> {t.script}
                                    </button>
                                </div>

                                <div className="p-6 flex-1 bg-surface">
                                    {resultTab === 'hooks' && (
                                        <div className="animate-fade-in space-y-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="text-sm font-bold text-textMain">Golden 3-Second Hooks</h3>
                                                <span className="text-[10px] text-textSecondary bg-background px-2 py-1 rounded border border-border">High Retention</span>
                                            </div>
                                            <div className="grid gap-3">
                                                {result.hooks.map((hook, i) => (
                                                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-border bg-background/50 hover:border-primary/30 transition-colors">
                                                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                                                            {i + 1}
                                                        </div>
                                                        <div className="text-sm text-textMain leading-relaxed">{hook}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {resultTab === 'strategy' && (
                                        <div className="animate-fade-in">
                                            <div className="prose prose-invert prose-sm max-w-none text-textSecondary leading-relaxed markdown-body">
                                                <ReactMarkdown>{result.strategy}</ReactMarkdown>
                                            </div>
                                        </div>
                                    )}

                                    {resultTab === 'script' && (
                                        <div className="animate-fade-in h-full flex flex-col">
                                            <div className="flex justify-between items-center mb-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                                    <span className="text-xs font-bold text-textMain uppercase tracking-wider">Shooting Script</span>
                                                </div>
                                                <button 
                                                    onClick={() => handleCopy(result.script)}
                                                    className="text-xs flex items-center gap-1.5 bg-background hover:bg-border px-3 py-1.5 rounded-lg border border-border transition-colors text-textMain font-medium"
                                                >
                                                    <Copy size={12}/> {language === 'zh' ? '复制' : 'Copy'}
                                                </button>
                                            </div>
                                            <div className="flex-1 bg-background border border-border rounded-xl p-6 font-mono text-sm text-textMain leading-loose whitespace-pre-wrap overflow-y-auto max-h-[400px] shadow-inner">
                                                {result.script}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TrendAnalysis;
