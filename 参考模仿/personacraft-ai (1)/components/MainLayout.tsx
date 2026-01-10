import React, { useState } from 'react';
import { Copy, Check, FileText, Settings, Wand2, Upload, Download } from 'lucide-react';
import { AppState } from '../types';

interface MainLayoutProps {
  rawKnowledge: string;
  setRawKnowledge: (val: string) => void;
  systemPrompt: string;
  optimizedKnowledge: string;
  appState: AppState;
  onGenerate: () => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  rawKnowledge,
  setRawKnowledge,
  systemPrompt,
  optimizedKnowledge,
  appState,
  onGenerate,
  onToggleSidebar,
  isSidebarOpen
}) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'knowledge'>('prompt');
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = () => {
    const content = activeTab === 'prompt' ? systemPrompt : optimizedKnowledge;
    if (!content) return;

    const filename = activeTab === 'prompt' ? 'system_prompt.md' : 'optimized_knowledge.md';
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawKnowledge(text);
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50/50">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-indigo-200 shadow-lg">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
            PersonaCraft AI
          </h1>
        </div>
        <div className="flex items-center space-x-3">
             <button 
            onClick={onToggleSidebar}
            className={`md:hidden p-2 rounded-md hover:bg-gray-100 ${isSidebarOpen ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500'}`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
        
        {/* Left: Input Section */}
        <div className="w-full md:w-1/2 p-4 md:p-6 flex flex-col border-r border-gray-200 bg-white h-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-indigo-500" />
              原始知识库
            </h2>
            <div className="relative">
                <input 
                    type="file" 
                    id="fileUpload" 
                    className="hidden" 
                    accept=".txt,.md,.json,.csv"
                    onChange={handleFileUpload}
                />
                <label 
                    htmlFor="fileUpload"
                    className="flex items-center text-xs font-medium text-gray-600 hover:text-indigo-600 cursor-pointer bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200 hover:border-indigo-200 transition-all"
                >
                    <Upload className="w-3 h-3 mr-1.5" />
                    上传文件
                </label>
            </div>
          </div>
          
          <div className="flex-1 relative">
            <textarea
              className="w-full h-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm text-gray-700 leading-relaxed transition-all placeholder-gray-400"
              placeholder="在此粘贴您的产品文档、品牌指南或角色简介..."
              value={rawKnowledge}
              onChange={(e) => setRawKnowledge(e.target.value)}
              disabled={appState === AppState.GENERATING}
            />
          </div>

          <div className="mt-4">
            <button
              onClick={onGenerate}
              disabled={!rawKnowledge.trim() || appState === AppState.GENERATING}
              className={`w-full py-3.5 rounded-xl font-semibold text-white shadow-lg transition-all flex items-center justify-center
                ${!rawKnowledge.trim() || appState === AppState.GENERATING
                  ? 'bg-gray-300 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 hover:shadow-indigo-200 hover:-translate-y-0.5'
                }`}
            >
              {appState === AppState.GENERATING ? (
                <>
                  <Wand2 className="w-5 h-5 mr-2 animate-spin" />
                  正在优化...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5 mr-2" />
                  生成智能体配置
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Output Section */}
        <div className="w-full md:w-1/2 flex flex-col bg-gray-50 h-full">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 bg-white px-6 pt-4">
            <button
              onClick={() => setActiveTab('prompt')}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center ${
                activeTab === 'prompt'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Settings className="w-4 h-4 mr-2" />
              系统提示词
            </button>
            <button
              onClick={() => setActiveTab('knowledge')}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center ${
                activeTab === 'knowledge'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4 mr-2" />
              优化后的知识库
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 relative">
            {!systemPrompt && !optimizedKnowledge ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                   <Settings className="w-8 h-8 text-gray-300" />
                </div>
                <p className="font-medium">准备就绪</p>
                <p className="text-sm mt-1">生成的内容将显示在此处</p>
              </div>
            ) : (
                <div className="relative h-full bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                     <div className="absolute top-3 right-3 z-10 flex items-center space-x-2">
                        <button
                            onClick={handleDownload}
                            className="p-2 bg-white/90 backdrop-blur border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-all flex items-center shadow-sm"
                            title="导出为 Markdown"
                        >
                            <Download className="w-4 h-4" />
                            <span className="ml-2 text-xs font-medium">导出 MD</span>
                        </button>
                        <button
                            onClick={() => handleCopy(activeTab === 'prompt' ? systemPrompt : optimizedKnowledge, activeTab)}
                            className="p-2 bg-white/90 backdrop-blur border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-all flex items-center shadow-sm"
                        >
                            {copied === activeTab ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            <span className="ml-2 text-xs font-medium">{copied === activeTab ? '已复制！' : '复制'}</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-6">
                        <pre className="whitespace-pre-wrap font-mono text-sm text-gray-700 leading-relaxed">
                            {activeTab === 'prompt' ? systemPrompt : optimizedKnowledge}
                        </pre>
                    </div>
                </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
};

export default MainLayout;