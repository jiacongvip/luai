import React, { useState, useCallback } from 'react';
import PersonaCraftMainLayout from '../components/PersonaCraftMainLayout';
import PersonaCraftChatSidebar from '../components/PersonaCraftChatSidebar';
import { api } from '../utils/api';
import { handleError } from '../utils/errorHandler';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

type AppState = 'IDLE' | 'GENERATING' | 'REFINING' | 'ERROR';

interface PersonaCraftProps {
  language: 'en' | 'zh';
}

const PersonaCraft: React.FC<PersonaCraftProps> = ({ language }) => {
  // State
  const [rawKnowledge, setRawKnowledge] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [optimizedKnowledge, setOptimizedKnowledge] = useState('');
  const [appState, setAppState] = useState<AppState>('IDLE');
  
  // Chat State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Handlers
  const handleGenerate = async () => {
    if (!rawKnowledge.trim()) return;

    setAppState('GENERATING');
    try {
      const result = await api.personacraft.generate(rawKnowledge);
      setSystemPrompt(result.systemPrompt || '');
      setOptimizedKnowledge(result.optimizedKnowledge || '');
      
      // Add initial system message to chat
      const initialMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        content: language === 'zh' 
          ? '我已经根据您的知识库生成了初始的智能体配置。请查看"系统提示词"和"优化后的知识库"标签页。您希望如何完善它们？'
          : 'I have generated the initial agent configuration based on your knowledge base. Please check the "System Prompt" and "Optimized Knowledge" tabs. How would you like to refine them?',
        timestamp: Date.now()
      };
      setChatHistory([initialMsg]);
      if (window.innerWidth >= 768) {
        setIsSidebarOpen(true);
      }
    } catch (error: any) {
      console.error("Generation failed:", error);
      handleError(error, {
        action: 'generate personacraft optimization',
        component: 'PersonaCraft',
      });
      const errorMsg = language === 'zh' 
        ? '生成内容失败。请检查您的 API 密钥并重试。'
        : 'Generation failed. Please check your API key and try again.';
      alert(errorMsg);
    } finally {
      setAppState('IDLE');
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
    setAppState('REFINING');

    try {
      // API Call
      const result = await api.personacraft.refine({
        currentPrompt: systemPrompt,
        currentKnowledge: optimizedKnowledge,
        instruction: message,
        history: chatHistory.map(h => ({ role: h.role, content: h.content }))
      });

      // Update State if changed and not null
      if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
      if (result.optimizedKnowledge) setOptimizedKnowledge(result.optimizedKnowledge);

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: result.chatResponse || (language === 'zh' ? '已根据您的要求更新内容。' : 'Content updated according to your request.'),
        timestamp: Date.now()
      };
      setChatHistory(prev => [...prev, botMsg]);

    } catch (error: any) {
      console.error("Refinement failed:", error);
      handleError(error, {
        action: 'refine personacraft content',
        component: 'PersonaCraft',
      });
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: language === 'zh' 
          ? '抱歉，处理您的请求时遇到了错误（可能是内容过长或网络超时）。'
          : 'Sorry, an error occurred while processing your request (possibly content too long or network timeout).',
        timestamp: Date.now()
      };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setAppState('IDLE');
    }
  };

  return (
    <div className="flex h-full w-full bg-gray-100 overflow-hidden">
      <PersonaCraftMainLayout 
        rawKnowledge={rawKnowledge}
        setRawKnowledge={setRawKnowledge}
        systemPrompt={systemPrompt}
        optimizedKnowledge={optimizedKnowledge}
        appState={appState}
        onGenerate={handleGenerate}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
        language={language}
      />
      
      {/* Sidebar */}
      {isSidebarOpen && (
        <PersonaCraftChatSidebar 
          chatHistory={chatHistory}
          onSendMessage={handleChatMessage}
          isProcessing={appState === 'REFINING'}
          isOpen={isSidebarOpen}
          hasContent={!!systemPrompt}
          language={language}
        />
      )}
    </div>
  );
};

export default PersonaCraft;


