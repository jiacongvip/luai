import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatSidebarProps {
  chatHistory: ChatMessage[];
  onSendMessage: (message: string) => void;
  isProcessing: boolean;
  isOpen: boolean;
  hasContent: boolean;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ 
  chatHistory, 
  onSendMessage, 
  isProcessing, 
  isOpen,
  hasContent 
}) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSendMessage(input);
    setInput('');
  };

  if (!isOpen) return null;

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full shadow-xl z-20 absolute right-0 md:relative md:block transform transition-transform duration-300 ease-in-out">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
        <div className="flex items-center space-x-2 text-indigo-600">
          <Sparkles className="w-5 h-5" />
          <h2 className="font-semibold text-gray-800">优化助手</h2>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50" ref={scrollRef}>
        {!hasContent && chatHistory.length === 0 && (
           <div className="text-center text-gray-400 mt-10">
             <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
             <p className="text-sm">请在左侧上传或粘贴您的知识库以开始优化。</p>
           </div>
        )}

        {hasContent && chatHistory.length === 0 && (
          <div className="text-center text-gray-500 mt-4 text-sm bg-indigo-50 p-4 rounded-lg border border-indigo-100">
            <p>初稿已生成！您可以在此与我对话，完善提示词或知识结构。</p>
            <p className="mt-2 text-xs text-indigo-600">尝试发送：“让语气更专业点” 或 “添加关于退款政策的章节”。</p>
          </div>
        )}

        {chatHistory.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.role === 'user' ? 'bg-indigo-600' : 'bg-emerald-600'
            }`}>
              {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-white text-gray-700 border border-gray-200 rounded-tl-none'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex items-start space-x-3">
             <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span className="text-sm text-gray-500">思考中...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing || !hasContent}
            placeholder={hasContent ? "完善提示词或知识库..." : "请先输入知识库内容"}
            className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={isProcessing || !hasContent || !input.trim()}
            className="absolute right-2 top-2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatSidebar;