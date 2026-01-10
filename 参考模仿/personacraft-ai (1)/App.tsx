import React, { useState, useCallback } from 'react';
import MainLayout from './components/MainLayout';
import ChatSidebar from './components/ChatSidebar';
import { generateInitialOptimization, refineContent } from './services/geminiService';
import { AppState, ChatMessage } from './types';

const App: React.FC = () => {
  // State
  const [rawKnowledge, setRawKnowledge] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [optimizedKnowledge, setOptimizedKnowledge] = useState('');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  
  // Chat State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Handlers
  const handleGenerate = async () => {
    if (!rawKnowledge.trim()) return;

    setAppState(AppState.GENERATING);
    try {
      const result = await generateInitialOptimization(rawKnowledge);
      setSystemPrompt(result.systemPrompt || '');
      setOptimizedKnowledge(result.optimizedKnowledge || '');
      
      // Add initial system message to chat
      const initialMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        content: '我已经根据您的知识库生成了初始的智能体配置。请查看“系统提示词”和“优化后的知识库”标签页。您希望如何完善它们？',
        timestamp: Date.now()
      };
      setChatHistory([initialMsg]);
      if (window.innerWidth >= 768) {
          setIsSidebarOpen(true);
      }
    } catch (error) {
      console.error("Generation failed:", error);
      alert("生成内容失败。请检查您的 API 密钥并重试。");
    } finally {
      setAppState(AppState.IDLE);
    }
  };

  const handleChatMessage = async (message: string) => {
    // Optimistic update
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: Date.now()
    };
    setChatHistory(prev => [...prev, userMsg]);
    setAppState(AppState.REFINING);

    try {
      // API Call
      const result = await refineContent(
        systemPrompt, 
        optimizedKnowledge, 
        message, 
        // Map history to simpler format for potential use, currently service uses direct context
        chatHistory.map(h => ({ role: h.role, content: h.content }))
      );

      // Update State if changed and not null
      if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
      if (result.optimizedKnowledge) setOptimizedKnowledge(result.optimizedKnowledge);

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: result.chatResponse || "已根据您的要求更新内容。",
        timestamp: Date.now()
      };
      setChatHistory(prev => [...prev, botMsg]);

    } catch (error) {
      console.error("Refinement failed:", error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: "抱歉，处理您的请求时遇到了错误（可能是内容过长或网络超时）。",
        timestamp: Date.now()
      };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setAppState(AppState.IDLE);
    }
  };

  return (
    <div className="flex h-screen w-full bg-gray-100 overflow-hidden">
      <MainLayout 
        rawKnowledge={rawKnowledge}
        setRawKnowledge={setRawKnowledge}
        systemPrompt={systemPrompt}
        optimizedKnowledge={optimizedKnowledge}
        appState={appState}
        onGenerate={handleGenerate}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
      />
      
      {/* Sidebar - Conditional rendering based on width handled via CSS classes usually, but here simple conditional + absolute for mobile */}
      <div className={`${isSidebarOpen ? 'block' : 'hidden'} md:block h-full transition-all duration-300`}>
         <ChatSidebar 
            chatHistory={chatHistory}
            onSendMessage={handleChatMessage}
            isProcessing={appState === AppState.REFINING}
            isOpen={isSidebarOpen}
            hasContent={!!systemPrompt}
         />
      </div>
    </div>
  );
};

export default App;