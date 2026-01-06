
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Send, Bot, User, AlertCircle, Coins, Paperclip, MoreHorizontal, Smile, X, Users, CheckCircle, FileText, Target, ShieldCheck, Loader2, Copy, Sparkles, Lightbulb, FileSearch, BrainCircuit, Briefcase, PenTool, Mail, BarChart, Cpu, Zap, Database, Trash2, StopCircle, ChevronDown, BookOpen, Save, GitBranch, ArrowRight, Brain, Sparkle, RefreshCw, ThumbsUp, ThumbsDown, MessageSquare, Palette, Wand2, LayoutTemplate, ArrowUpRight } from 'lucide-react';
import { Message, MessageType, Agent, User as UserType, Language, ChatSession, PromptTemplate, ProjectContext, UserProfileData, ThoughtData } from '../types';
import { generateAgentResponse, classifyMessageIntent, generateFollowUpQuestions, detectContextUpdate, ContextUpdateSuggestion } from '../services/geminiService';
import { translations } from '../utils/translations';
import { storage } from '../utils/storage';
import { api } from '../utils/api';
import { extractPreferences } from '../utils/preferences';
import { retryWithBackoff, shouldRetry } from '../utils/retry';
import { handleError, parseSSEChunk } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import { websocketClient } from '../utils/websocketClient';
import XiaohongshuSimulator from './XiaohongshuSimulator';

interface ChatProps {
  user: UserType;
  messages: Message[];
  activeSession: ChatSession;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onUpdateCredits: (newAmount: number) => void;
  activeSessionId: string;
  language: Language;
  promptTemplates: PromptTemplate[];
  onUpdateProjectData?: (projectId: string, newData: UserProfileData) => void;
  onStartPrivateChat?: (agentId: string) => void;
  agents: Agent[]; // Agents passed from App state
  enableStylePrompt?: boolean; // NEW PROP
  showSimulator?: boolean; // NEW PROP
  onSessionCreated?: (sessionId: string) => void; // Callback when session is auto-created
}

// Helper for unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// ... (buildContextPrompt helper remains the same) ...
const buildContextPrompt = (project: ProjectContext | undefined): string => {
    if (!project || !project.data) return '';

    let contextString = `\n\n[[CURRENT PROJECT CONTEXT]]\n`;
    contextString += `Project Name: ${project.name}\n`;
    contextString += `Description: ${project.description || 'N/A'}\n`;
    
    contextString += `\n[Key Data Points]:\n`;
    Object.entries(project.data).forEach(([key, value]) => {
        // Skip large file contents in the summary section, handle them below
        if (!key.startsWith('_content_') && !key.startsWith('documents') && !key.startsWith('_successful_examples_')) {
             const valStr = Array.isArray(value) ? value.join(', ') : String(value);
             contextString += `- ${key}: ${valStr}\n`;
        }
    });

    // Inject File Content
    const contentKeys = Object.keys(project.data).filter(k => k.startsWith('_content_'));
    if (contentKeys.length > 0) {
        contextString += `\n[Attached Knowledge Base]:\n`;
        contentKeys.forEach(key => {
            const files = project.data[key] as unknown as Record<string, string>;
            if (files) {
                Object.entries(files).forEach(([fileName, content]) => {
                    contextString += `\n--- START FILE: ${fileName} ---\n${content}\n--- END FILE: ${fileName} ---\n`;
                });
            }
        });
    }
    
    contextString += `[[END CONTEXT]]\n\nIMPORTANT INSTRUCTION: The user is asking about the project defined above. Use the provided Context and Files to answer. If the user refers to "my product" or "this project", they refer to the data above.\n\n`;
    
    return contextString;
};

const Chat: React.FC<ChatProps> = ({ user, activeSession, messages, setMessages, onUpdateCredits, activeSessionId, language, promptTemplates, onUpdateProjectData, onStartPrivateChat, agents, enableStylePrompt = true, showSimulator = false, onSessionCreated }) => {
  console.log('🔵 Chat component rendered:', { activeSessionId, activeSession: activeSession?.id, messagesCount: messages.length });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [useWebSocket, setUseWebSocket] = useState(false); // 是否使用WebSocket（类似大公司）
  const [enableWebSocketButton, setEnableWebSocketButton] = useState(false); // 是否显示WebSocket按钮（来自数据库）
  
  // Model Selection State
  const [allowModelSelect, setAllowModelSelect] = useState(false);
  const [availableModels, setAvailableModels] = useState<{id: string, name: string}[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(''); // Empty means default

  // Feature Flags
  const [showContextDrawerFeature, setShowContextDrawerFeature] = useState(false);
  const [showThoughtChainFeature, setShowThoughtChainFeature] = useState(true);
  const [showFollowUps, setShowFollowUps] = useState(true);
  const [showRichActions, setShowRichActions] = useState(true);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false); 
  const [localContextData, setLocalContextData] = useState<UserProfileData>({});
  
  // Simulator Data State
  const [simulatorData, setSimulatorData] = useState<{title?: string, content: string} | undefined>(undefined);

  // Agent Card State
  const [viewingAgent, setViewingAgent] = useState<Agent | null>(null);
  
  // Style Chip State
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [hasDismissedStylePrompt, setHasDismissedStylePrompt] = useState(false);

  // Context Suggestion State
  const [contextSuggestion, setContextSuggestion] = useState<ContextUpdateSuggestion | null>(null);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const confirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  
  // Safe Translations
  const t = translations[language]?.chat || translations['en'].chat;
  const tCommon = translations[language]?.common || translations['en'].common;

  const activeProject = user.projects?.find(p => p.id === user.activeProjectId);

  // Load Config from System Settings（系统级全局设置）
  const loadConfig = async () => {
      try {
          const settings = await api.systemSettings.get();

          setAllowModelSelect(settings.allowModelSelect ?? true);
          setAvailableModels(settings.availableModels || []);
          setShowContextDrawerFeature(settings.showContextDrawer ?? true);
          setShowThoughtChainFeature(settings.showThoughtChain ?? true);
          setShowFollowUps(settings.showFollowUps ?? true);
          setShowRichActions(settings.showRichActions ?? true);
          setEnableWebSocketButton(settings.enableWebSocket ?? false);

          if (!selectedModel) setSelectedModel(settings.modelName || 'gemini-3-flash-preview');
      } catch (e) {
          // 不要白屏：失败时保留默认值
          console.error('Failed to load system settings for Chat:', e);
      }
  };

  useEffect(() => {
      loadConfig();
  }, []);

  useEffect(() => {
      setInput('');
      setSelectedStyle(null);
      setHasDismissedStylePrompt(false);
      setProcessingStatus(null);
      setIsTyping(false);
      setContextSuggestion(null);
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
      }
  }, [activeSessionId]);

  useEffect(() => {
      if (activeProject) {
          setLocalContextData(activeProject.data);
      } else {
          setLocalContextData({});
      }
  }, [activeProject]);

  const participatingAgents = activeSession.isGroup 
    ? agents.filter(a => activeSession.participants?.includes(a.id))
    : agents.filter(a => activeSession.participants?.[0] === a.id);

  const activeStyleAgent = (!activeSession.isGroup && participatingAgents.length === 1 && participatingAgents[0].styles && participatingAgents[0].styles.length > 0)
      ? participatingAgents[0]
      : null;

  // --- SMART AUTO SCROLL ---
  const scrollToBottom = () => {
    if (!chatContainerRef.current || !messagesEndRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    // Tolerance of 150px
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;

    if (isNearBottom) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Force scroll on new message sent by user (always)
  useEffect(() => {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.type === MessageType.USER) {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      } else {
          scrollToBottom();
      }
  }, [messages, isTyping, processingStatus]);

  useEffect(() => {
    if (activeSession.isGroup) {
        if (input.endsWith('@')) {
        setShowAgentSelector(true);
        } else if (input.includes(' ') && showAgentSelector) {
        setShowAgentSelector(false);
        } else if (input === '') {
            setShowAgentSelector(false);
        }
    } else {
        setShowAgentSelector(false);
    }
  }, [input, activeSession.isGroup]);

  const getLastAiContent = () => {
      const lastAgentMsg = [...messages].reverse().find(m => m.type === MessageType.AGENT && !m.isStreaming);
      return lastAgentMsg ? { content: lastAgentMsg.content, title: 'Draft' } : undefined;
  };

  const sendToSimulator = (content: string) => {
      setSimulatorData({ content, title: 'Draft from Chat' });
      setIsSimulatorOpen(true);
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleStopGeneration = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
          setIsTyping(false);
          setProcessingStatus(null);
      }
      if (confirmationTimerRef.current) {
          clearTimeout(confirmationTimerRef.current);
          confirmationTimerRef.current = null;
      }
  };

  const handleClearHistory = () => {
      if (confirm('Clear chat history?')) {
          setMessages([]);
      }
  };

  const handleCopyCode = (code: string) => {
      navigator.clipboard.writeText(code);
  };

  const handleSaveContext = () => {
      if (activeProject && onUpdateProjectData) {
          onUpdateProjectData(activeProject.id, localContextData);
          setIsDrawerOpen(false);
      }
  };

  const handleApplyContextSuggestion = () => {
      if (!contextSuggestion || !activeProject || !onUpdateProjectData) return;
      const updatedData = { ...activeProject.data, [contextSuggestion.key]: contextSuggestion.newValue };
      onUpdateProjectData(activeProject.id, updatedData);
      setLocalContextData(updatedData); // Sync local state
      setContextSuggestion(null); // Clear suggestion
  };

  const handleSend = async (manualInput?: string) => {
    console.log('🔵 handleSend called:', { manualInput, input, activeSessionId, activeSession });
    const textToSend = manualInput || input;
    console.log('🔵 textToSend:', textToSend);
    if (!textToSend.trim()) {
      console.log('⚠️ Empty message, returning');
      return;
    }
    
    // 检查会话是否存在
    if (!activeSession) {
      console.error('❌ No active session found!');
      alert(language === 'zh' ? '会话不存在，请创建新会话' : 'No active session found, please create a new session');
      return;
    }
    
    // 检查会话 ID 是否是临时 ID（没有 's' 前缀且格式为 timestamp-random）
    // 如果是临时 ID，先尝试等待一下（最多 1 秒），然后直接尝试发送
    // 如果后端返回 404，说明会话还没创建完成，再提示用户等待
    if (!activeSessionId.startsWith('s') && activeSessionId.match(/^\d+-/)) {
      console.warn('⚠️ Session ID appears to be temporary:', activeSessionId);
      
      // 快速等待一下（最多 1 秒），看看会话是否已创建
      let sessionCreated = false;
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (activeSession && activeSession.id && activeSession.id.startsWith('s')) {
          console.log('✅ Session created during wait, ID:', activeSession.id);
          sessionCreated = true;
          break;
        }
      }
      
      // 如果还没创建，继续发送（让后端处理 404）
      if (!sessionCreated) {
        console.warn('⚠️ Session still temporary, will try to send anyway');
      }
    }
    
    console.log('✅ Proceeding with send...');

    // 乐观更新：立即显示用户消息
    const tempUserMsgId = generateId();
    const userMsg: Message = {
      id: tempUserMsgId,
      type: MessageType.USER,
      content: textToSend,
      senderId: user.id,
      senderName: t.me,
      senderAvatar: user.avatar,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setContextSuggestion(null); // Clear any pending suggestions

    const contextPrefix = buildContextPrompt(activeProject);
    let promptWithContext = contextPrefix 
        ? `${contextPrefix}\n\nUser Question: ${textToSend}` 
        : textToSend;

    // === SCENARIO A: SINGLE AGENT CHAT ===
    console.log('🔍 Checking session type:', { isGroup: activeSession.isGroup, participants: activeSession.participants, agentsCount: agents.length });
    if (!activeSession.isGroup) {
        const targetAgentId = activeSession.participants?.[0];
        console.log('🔍 Looking for agent:', { targetAgentId, agents: agents.map(a => ({ id: a.id, name: a.name })) });
        let targetAgent = agents.find(a => a.id === targetAgentId);
        
        // 如果找不到指定的 agent，使用第一个可用的 agent 或默认 agent
        if (!targetAgent) {
            console.warn('⚠️ Agent not found:', targetAgentId, 'Using fallback agent');
            targetAgent = agents.find(a => a.id === 'a1') || agents[0];
            if (targetAgent) {
                console.log('✅ Using fallback agent:', { id: targetAgent.id, name: targetAgent.name });
            } else {
                console.error('❌ No agents available!');
                setIsTyping(false);
                return;
            }
        }
        console.log('🔍 Found agent:', { id: targetAgent.id, name: targetAgent.name });

        if (targetAgent) {
             // 记录用户消息到日志（现在targetAgent已定义）
             logger.logUserMessage(activeSessionId, textToSend, {
               agentId: targetAgent.id,
               model: selectedModel
             });
             
             if (targetAgent.styles && targetAgent.styles.length > 0 && !selectedStyle && !hasDismissedStylePrompt && enableStylePrompt) {
                 setIsTyping(false);
                 addStyleRequest(targetAgent, promptWithContext, undefined, textToSend);
                 return;
             }

             if (selectedStyle && targetAgent.styles?.includes(selectedStyle)) {
                 promptWithContext = `[Style/Tone Instruction: Please use a "${selectedStyle}" style for this response]\n\n${promptWithContext}`;
             }
             
             // 如果使用WebSocket（类似大公司的实现）
             if (useWebSocket && websocketClient.isConnected()) {
                 try {
                     setIsTyping(true);
                     websocketClient.sendMessage({
                         sessionId: activeSessionId,
                         content: textToSend,
                         agentId: targetAgent.id,
                         modelOverride: selectedModel,
                         contextData: activeProject?.data
                     });
                     return; // WebSocket会通过onMessage处理响应
                 } catch (error: any) {
                     console.error('WebSocket send error:', error);
                     // 回退到SSE
                 }
             }
             
             // 对于单 agent 聊天，直接调用后端 API（会保存用户消息和 AI 响应）
             try {
                 // 使用 activeSession.id 如果它已更新，否则使用 activeSessionId
                 const sessionIdToUse = (activeSession && activeSession.id && activeSession.id.startsWith('s')) 
                     ? activeSession.id 
                     : activeSessionId;
                 
                 console.log('🚀 Sending message:', { 
                     activeSessionId, 
                     sessionIdToUse, 
                     textToSend, 
                     agentId: targetAgent.id,
                     hasActiveProject: !!activeProject,
                     activeProjectId: activeProject?.id,
                     activeProjectName: activeProject?.name,
                     hasContextData: !!activeProject?.data,
                     contextDataKeys: activeProject?.data ? Object.keys(activeProject.data) : [],
                     contextDataSample: activeProject?.data ? Object.entries(activeProject.data)
                         .filter(([k]) => !k.startsWith('_') && k !== 'documents')
                         .slice(0, 3)
                         .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}) : {}
                 });
                 
                // 如果是临时会话ID，先尝试创建会话
                let finalSessionId = sessionIdToUse;
                if (!sessionIdToUse.startsWith('s') && sessionIdToUse.match(/^\d+-/)) {
                    console.log('🔄 Temporary session detected, creating real session first...');
                    try {
                        const savedSession = await api.sessions.create({
                            title: language === 'zh' ? '新对话' : 'New Chat',
                            isGroup: false,
                            participants: activeSession.participants || ['a1']
                        });
                        console.log('✅ Session created automatically:', savedSession.id);
                        finalSessionId = savedSession.id;
                        
                        // 通知父组件更新会话ID
                        if (onSessionCreated) {
                            onSessionCreated(savedSession.id);
                        }
                    } catch (createError: any) {
                        console.error('❌ Failed to create session:', createError);
                        // 继续使用临时ID，让后端处理
                    }
                }
                 
                 // 流式请求不使用 retryWithBackoff，直接发送以确保实时响应
                console.log('📡 Calling api.messages.send with sessionId:', finalSessionId, {
                    hasContextData: !!activeProject?.data,
                    contextDataKeys: activeProject?.data ? Object.keys(activeProject.data) : []
                });
                
                const response = await api.messages.send(finalSessionId, textToSend, {
                    agentId: targetAgent.id,
                    modelOverride: selectedModel,
                    contextData: activeProject?.data
                });
                
                console.log('✅ Got SSE response:', response.status, response.ok, 'Headers:', response.headers.get('content-type'));

                 if (!response.ok) {
                     throw new Error(`HTTP ${response.status}`);
                 }

                 // 处理 SSE 流式响应
                 const reader = response.body?.getReader();
                 if (!reader) {
                     throw new Error('Failed to get response reader');
                 }

                 const decoder = new TextDecoder();
                 let buffer = '';
                 let aiMessageId = generateId();
                 let originalMessageId = aiMessageId; // 保存原始ID，用于查找消息
                 let accumulatedText = '';
                 let aiMessage: Message | null = null;
                 let lastUpdateTime = Date.now();
                 const UPDATE_THROTTLE = 16; // 每 16ms 更新一次 UI（约60fps），实现流畅的打字效果
                 let pendingUpdate: number | null = null;
                let hasReceivedData = false; // 跟踪是否收到任何数据
                const STREAM_TIMEOUT = 30000; // 30秒超时
                const streamStartTime = Date.now();

                console.log('📥 Starting SSE stream processing...', { aiMessageId, originalMessageId });

                 while (true) {
                     if (abortControllerRef.current?.signal.aborted) {
                        console.log('⚠️ Stream aborted by user');
                         reader.cancel();
                         break;
                     }

                    // 检查超时
                    if (Date.now() - streamStartTime > STREAM_TIMEOUT && !hasReceivedData) {
                        console.error('⏱️ Stream timeout: No data received within 30 seconds');
                        throw new Error('Stream timeout: No response from server');
                    }

                     const { done, value } = await reader.read();
                    
                    // 处理接收到的数据
                    if (value) {
                        hasReceivedData = true; // 标记已收到数据
                        const decoded = decoder.decode(value, { stream: true });
                        buffer += decoded;
                        console.log('📦 Received chunk:', { 
                            chunkLength: decoded.length, 
                            bufferLength: buffer.length,
                            hasDataPrefix: buffer.includes('data: ')
                        });
                    }
                    
                    // 如果流结束，处理剩余的 buffer
                     if (done) {
                        console.log('🏁 Stream done, processing remaining buffer:', buffer.length, 'chars', 'hasReceivedData:', hasReceivedData);
                        
                        // 如果没有收到任何数据，显示错误
                        if (!hasReceivedData && !buffer.trim()) {
                            console.error('❌ Stream ended without any data');
                            throw new Error('No data received from server');
                        }
                        
                        // 处理 buffer 中剩余的所有内容（可能包含最后一个不完整的事件）
                        if (buffer.trim()) {
                            // 尝试按SSE格式解析
                            const remainingEvents = buffer.split('\n\n');
                            for (const event of remainingEvents) {
                                const dataLine = event.split('\n').find(line => line.startsWith('data: '));
                                if (dataLine) {
                                try {
                                        const jsonStr = dataLine.substring(6);
                                        const data = JSON.parse(jsonStr);
                                    
                                    if (data.type === 'chunk') {
                                        accumulatedText += data.content;
                                            console.log('📝 Final chunk added, total length:', accumulatedText.length);
                                    } else if (data.type === 'done') {
                                        // 更新为数据库返回的ID，但保留原始ID用于查找
                                        if (data.messageId) {
                                                console.log('🔄 Updating message ID:', originalMessageId, '->', data.messageId);
                                            aiMessageId = data.messageId;
                                        }
                                    }
                                } catch (e) {
                                        console.error('❌ Failed to parse final SSE data:', e, 'Data:', dataLine.substring(0, 100));
                                    }
                                }
                            }
                        }
                        
                        // 取消任何待处理的更新
                        if (pendingUpdate !== null) {
                            cancelAnimationFrame(pendingUpdate);
                            pendingUpdate = null;
                        }
                        
                         // 确保最终内容已更新（重要：防止内容丢失）
                        console.log('🔄 Stream ended, final update:', { 
                            originalMessageId,
                            aiMessageId, 
                            accumulatedLength: accumulatedText.length, 
                            hasAiMessage: !!aiMessage 
                        });
                        
                         if (aiMessage && accumulatedText) {
                             // 使用函数式更新，确保使用最新的accumulatedText
                            // 使用原始ID查找消息（因为消息可能是用原始ID创建的）
                            setMessages(prev => {
                                const updated = prev.map(m => {
                                    // 匹配原始ID或新ID（处理ID更新情况）
                                    if (m.id === originalMessageId || m.id === aiMessageId) {
                                     // 确保使用完整的accumulatedText
                                        console.log('✅ Updating message with full content:', accumulatedText.length, 'chars');
                                        return { ...m, id: aiMessageId, content: accumulatedText, isStreaming: false };
                                 }
                                 return m;
                                });
                                // 验证更新是否成功
                                const updatedMsg = updated.find(m => m.id === aiMessageId);
                                if (updatedMsg) {
                                    console.log('✅ Message updated successfully:', updatedMsg.content.length, 'chars');
                                } else {
                                    console.warn('⚠️ Message not found after update, trying to add:', aiMessageId);
                                    // 如果找不到，直接添加
                                    updated.push({
                                        id: aiMessageId,
                                        type: MessageType.AGENT,
                                        content: accumulatedText,
                                        senderId: targetAgent.id,
                                        senderName: language === 'zh' ? (targetAgent.role_zh || targetAgent.name) : targetAgent.name,
                                        senderAvatar: targetAgent.avatar,
                                        timestamp: Date.now(),
                                        isStreaming: false
                                    });
                                }
                                return updated;
                            });
                             // 记录AI回复到日志
                             logger.logAIResponse(activeSessionId, accumulatedText, {
                                 messageId: aiMessageId,
                                 agentId: targetAgent.id,
                                 length: accumulatedText.length
                             });
                        } else if (accumulatedText && !aiMessage) {
                            // 如果流结束时还没有创建消息，立即创建
                            setIsTyping(false);
                            const finalMessage: Message = {
                                id: aiMessageId,
                                type: MessageType.AGENT,
                                content: accumulatedText,
                                senderId: targetAgent.id,
                                senderName: language === 'zh' ? (targetAgent.role_zh || targetAgent.name) : targetAgent.name,
                                senderAvatar: targetAgent.avatar,
                                timestamp: Date.now(),
                                isStreaming: false
                            };
                            setMessages(prev => [...prev, finalMessage]);
                            logger.logAIResponse(activeSessionId, accumulatedText, {
                                messageId: aiMessageId,
                                agentId: targetAgent.id,
                                length: accumulatedText.length
                            });
                        }
                        
                        // 生成后续问题
                        if (showFollowUps && accumulatedText.length > 50) {
                            try {
                                const followUps = await generateFollowUpQuestions(textToSend, accumulatedText, language);
                                if (followUps && followUps.length > 0) {
                                    setMessages(prev => prev.map(m => 
                                        m.id === aiMessageId ? { ...m, suggestedFollowUps: followUps } : m
                                    ));
                                }
                            } catch (e) {
                                console.error("Smart Followup Error", e);
                            }
                        }
                        
                         break;
                     }

                    // 处理 buffer 中的完整行（SSE格式：data: {...}\n\n）
                    // 按双换行符分割，因为SSE事件之间用\n\n分隔
                    const events = buffer.split('\n\n');
                    // 保留最后一个不完整的事件在buffer中
                    buffer = events.pop() || '';

                    for (const event of events) {
                        // 找到 data: 开头的行
                        const dataLine = event.split('\n').find(line => line.startsWith('data: '));
                        if (dataLine) {
                             try {
                                const jsonStr = dataLine.substring(6); // 去掉 'data: ' 前缀
                                const data = JSON.parse(jsonStr);
                                
                                console.log('📨 Parsed SSE event:', { type: data.type, hasContent: !!data.content });
                                 
                                 if (data.type === 'chunk') {
                                     accumulatedText += data.content;
                                    console.log('📝 Accumulated text length:', accumulatedText.length);
                                     
                                    // 立即创建消息（如果还没有）
                                     if (!aiMessage) {
                                        console.log('✨ Creating new AI message...');
                                         setIsTyping(false);
                                         aiMessage = {
                                             id: aiMessageId,
                                             type: MessageType.AGENT,
                                             content: accumulatedText,
                                             senderId: targetAgent.id,
                                             senderName: language === 'zh' ? (targetAgent.role_zh || targetAgent.name) : targetAgent.name,
                                             senderAvatar: targetAgent.avatar,
                                             timestamp: Date.now(),
                                             isStreaming: true
                                         };
                                        setMessages(prev => {
                                            console.log('➕ Adding AI message to list, current count:', prev.length);
                                            return [...prev, aiMessage!];
                                        });
                                        lastUpdateTime = Date.now();
                                    } else {
                                        // 使用 requestAnimationFrame 实现流畅的打字效果
                                        const now = Date.now();
                                        const shouldUpdate = now - lastUpdateTime >= UPDATE_THROTTLE;
                                        
                                        if (shouldUpdate) {
                                            // 取消之前的待更新
                                            if (pendingUpdate !== null) {
                                                cancelAnimationFrame(pendingUpdate);
                                            }
                                            
                                            // 使用 requestAnimationFrame 确保在下一帧更新
                                            pendingUpdate = requestAnimationFrame(() => {
                                         setMessages(prev => prev.map(m => {
                                             if (m.id === aiMessageId) {
                                                 return { ...m, content: accumulatedText, isStreaming: true };
                                             }
                                             return m;
                                         }));
                                                lastUpdateTime = Date.now();
                                                pendingUpdate = null;
                                            });
                                        } else {
                                            // 如果还没到更新时间，但需要确保最终会更新
                                            // 使用 requestAnimationFrame 延迟更新
                                            if (pendingUpdate === null) {
                                                pendingUpdate = requestAnimationFrame(() => {
                                                    setMessages(prev => prev.map(m => {
                                                        if (m.id === aiMessageId) {
                                                            return { ...m, content: accumulatedText, isStreaming: true };
                                                        }
                                                        return m;
                                                    }));
                                                    lastUpdateTime = Date.now();
                                                    pendingUpdate = null;
                                                });
                                            }
                                        }
                                     }
                                     // 注意：即使不更新UI，accumulatedText也在累积，最终会在done时更新
                                    // 如果节流导致更新被跳过，确保在流结束时强制更新
                                 } else if (data.type === 'done') {
                                     // 更新消息 ID 为数据库返回的 ID
                                    if (data.messageId) {
                                        aiMessageId = data.messageId;
                                    }
                                    
                                    console.log('✅ Received done event:', { 
                                        originalMessageId,
                                        messageId: aiMessageId, 
                                        accumulatedLength: accumulatedText.length 
                                    });
                                     
                                     // 确保最终内容已更新（重要：防止内容丢失）
                                     // 使用函数式更新，确保使用最新的accumulatedText
                                    // 使用原始ID查找消息（因为消息可能是用原始ID创建的）
                                    setMessages(prev => {
                                        const updated = prev.map(m => {
                                            // 匹配原始ID或新ID（处理ID更新情况）
                                            if (m.id === originalMessageId || m.id === aiMessageId) {
                                             // 强制使用完整的accumulatedText
                                                console.log('✅ Updating message in done event:', accumulatedText.length, 'chars');
                                             return { ...m, id: aiMessageId, content: accumulatedText, isStreaming: false };
                                         }
                                         return m;
                                        });
                                        // 验证更新
                                        const updatedMsg = updated.find(m => m.id === aiMessageId);
                                        if (updatedMsg) {
                                            console.log('✅ Message updated in done event:', updatedMsg.content.length, 'chars');
                                        } else {
                                            console.warn('⚠️ Message not found in done event, trying to add:', aiMessageId);
                                            // 如果找不到，直接添加
                                            updated.push({
                                                id: aiMessageId,
                                                type: MessageType.AGENT,
                                                content: accumulatedText,
                                                senderId: targetAgent.id,
                                                senderName: language === 'zh' ? (targetAgent.role_zh || targetAgent.name) : targetAgent.name,
                                                senderAvatar: targetAgent.avatar,
                                                timestamp: Date.now(),
                                                isStreaming: false
                                            });
                                        }
                                        return updated;
                                    });
                                     
                                     // 记录AI回复到日志
                                     logger.logAIResponse(activeSessionId, accumulatedText, {
                                         messageId: aiMessageId,
                                         agentId: targetAgent.id,
                                         length: accumulatedText.length
                                     });
                                     
                                     // 生成后续问题
                                     if (showFollowUps && accumulatedText.length > 50) {
                                         try {
                                             const followUps = await generateFollowUpQuestions(textToSend, accumulatedText, language);
                                             if (followUps && followUps.length > 0) {
                                                 setMessages(prev => prev.map(m => 
                                                     m.id === aiMessageId ? { ...m, suggestedFollowUps: followUps } : m
                                                 ));
                                             }
                                         } catch (e) {
                                             console.error("Smart Followup Error", e);
                                         }
                                     }
                                 } else if (data.type === 'error') {
                                     console.error('❌ Received error from server:', data.error);
                                     // 创建错误消息显示给用户
                                     setIsTyping(false);
                                     const errorMessage: Message = {
                                         id: aiMessageId,
                                         type: MessageType.AGENT,
                                         content: language === 'zh' 
                                             ? `❌ 错误：${data.error || 'AI生成失败'}`
                                             : `❌ Error: ${data.error || 'AI generation failed'}`,
                                         senderId: targetAgent.id,
                                         senderName: language === 'zh' ? (targetAgent.role_zh || targetAgent.name) : targetAgent.name,
                                         senderAvatar: targetAgent.avatar,
                                         timestamp: Date.now(),
                                         isStreaming: false
                                     };
                                     setMessages(prev => {
                                         // 如果已经有消息，更新它；否则添加新消息
                                         const existingIndex = prev.findIndex(m => m.id === aiMessageId || m.id === originalMessageId);
                                         if (existingIndex >= 0) {
                                             const updated = [...prev];
                                             updated[existingIndex] = errorMessage;
                                             return updated;
                                         }
                                         return [...prev, errorMessage];
                                     });
                                     break; // 退出循环
                                 }
                             } catch (e) {
                                 console.error('Failed to parse SSE data:', e);
                             }
                         }
                     }
                 }
             } catch (error: any) {
                 // 错误处理：回滚用户消息
                 setIsTyping(false);
                 
                 console.error('❌ Error in handleSend:', error);
                 
                 // 显示错误消息给用户
                 const errorMessage: Message = {
                     id: generateId(),
                     type: MessageType.AGENT,
                     content: language === 'zh' 
                         ? `❌ 错误：${error.message || '无法获取AI回复，请稍后重试'}`
                         : `❌ Error: ${error.message || 'Failed to get AI response, please try again'}`,
                     senderId: targetAgent.id,
                     senderName: language === 'zh' ? (targetAgent.role_zh || targetAgent.name) : targetAgent.name,
                     senderAvatar: targetAgent.avatar,
                     timestamp: Date.now(),
                     isStreaming: false
                 };
                 setMessages(prev => [...prev, errorMessage]);
                 
                 // 如果是会话不存在错误，尝试自动创建会话并重新发送消息
                 if (error.message?.includes('Session not found') || error.message?.includes('404')) {
                     console.log('🔄 Session not found, attempting to create session and resend...');
                     try {
                         // 创建会话
                         const savedSession = await api.sessions.create({
                             title: language === 'zh' ? '新对话' : 'New Chat',
                             isGroup: false,
                             participants: activeSession.participants || ['a1']
                         });
                         console.log('✅ Session created automatically:', savedSession.id);
                         
                         // 通知父组件更新会话ID
                         if (onSessionCreated) {
                             onSessionCreated(savedSession.id);
                         }
                         
                         // 使用新会话 ID 重新发送消息
                         console.log('🔄 Resending message with new session ID:', savedSession.id);
                         
                         // 获取 targetAgent（从外层作用域）
                         const targetAgentId = activeSession.participants?.[0];
                         let targetAgent = agents.find(a => a.id === targetAgentId);
                         if (!targetAgent) {
                             targetAgent = agents.find(a => a.id === 'a1') || agents[0];
                         }
                         
                         if (!targetAgent) {
                             throw new Error('No agent available');
                         }
                         
                         // 重新发送消息
                         const retryResponse = await api.messages.send(savedSession.id, textToSend, {
                             agentId: targetAgent.id,
                             modelOverride: selectedModel,
                             contextData: activeProject?.data
                         });
                         
                         if (!retryResponse.ok) {
                             throw new Error(`HTTP ${retryResponse.status}`);
                         }
                         
                         // 处理 SSE 流式响应（复用之前的逻辑）
                         const reader = retryResponse.body?.getReader();
                         if (!reader) {
                             throw new Error('Failed to get response reader');
                         }
                         
                         const decoder = new TextDecoder();
                         let buffer = '';
                         let aiMessageId = generateId();
                         let accumulatedText = '';
                         let aiMessage: Message | null = null;
                         let lastUpdateTime = Date.now();
                         const UPDATE_THROTTLE = 16; // 每 16ms 更新一次 UI（约60fps），实现流畅的打字效果
                         let pendingUpdate: number | null = null;
                         
                         while (true) {
                             if (abortControllerRef.current?.signal.aborted) {
                                 reader.cancel();
                                 break;
                             }
                             
                             const { done, value } = await reader.read();
                             
                             // 处理接收到的数据
                             if (value) {
                             buffer += decoder.decode(value, { stream: true });
                             }
                             
                             // 如果流结束，处理剩余的 buffer
                             if (done) {
                                 // 处理 buffer 中剩余的所有内容
                                 const allLines = buffer.split('\n');
                                 for (const line of allLines) {
                                     if (line.trim() && line.startsWith('data: ')) {
                                         try {
                                             const data = JSON.parse(line.substring(6));
                                             
                                             if (data.type === 'chunk') {
                                                 accumulatedText += data.content;
                                             } else if (data.type === 'done') {
                                                 aiMessageId = data.messageId || aiMessageId;
                                             }
                                         } catch (e) {
                                             console.error('Failed to parse final SSE data:', e);
                                         }
                                     }
                                 }
                                 
                                 // 取消任何待处理的更新
                                 if (pendingUpdate !== null) {
                                     cancelAnimationFrame(pendingUpdate);
                                     pendingUpdate = null;
                                 }
                                 
                                 // 确保最终内容已更新
                                 if (aiMessage && accumulatedText) {
                                     setMessages(prev => prev.map(m => {
                                         if (m.id === aiMessageId) {
                                             return { ...m, id: aiMessageId, content: accumulatedText, isStreaming: false };
                                         }
                                         return m;
                                     }));
                                 } else if (accumulatedText && !aiMessage) {
                                     setIsTyping(false);
                                     const finalMessage: Message = {
                                         id: aiMessageId,
                                         type: MessageType.AGENT,
                                         content: accumulatedText,
                                         senderId: targetAgent.id,
                                         senderName: language === 'zh' ? (targetAgent.role_zh || targetAgent.name) : targetAgent.name,
                                         senderAvatar: targetAgent.avatar,
                                         timestamp: Date.now(),
                                         isStreaming: false
                                     };
                                     setMessages(prev => [...prev, finalMessage]);
                                 }
                                 setIsTyping(false);
                                 break;
                             }
                             
                             // 处理 buffer 中的完整行
                             const lines = buffer.split('\n');
                             buffer = lines.pop() || '';
                             
                             for (const line of lines) {
                                 if (line.startsWith('data: ')) {
                                     try {
                                         const data = JSON.parse(line.substring(6));
                                         
                                         if (data.type === 'chunk') {
                                             accumulatedText += data.content;
                                             
                                             // 立即创建消息（如果还没有）
                                             if (!aiMessage) {
                                                 setIsTyping(false);
                                                 aiMessage = {
                                                     id: aiMessageId,
                                                     type: MessageType.AGENT,
                                                     content: accumulatedText,
                                                     senderId: targetAgent.id,
                                                     senderName: language === 'zh' ? (targetAgent.role_zh || targetAgent.name) : targetAgent.name,
                                                     senderAvatar: targetAgent.avatar,
                                                     timestamp: Date.now(),
                                                     isStreaming: true
                                                 };
                                                 setMessages(prev => [...prev, aiMessage!]);
                                                 lastUpdateTime = Date.now();
                                             } else {
                                                 // 使用 requestAnimationFrame 实现流畅的打字效果
                                                 const now = Date.now();
                                                 const shouldUpdate = now - lastUpdateTime >= UPDATE_THROTTLE;
                                                 
                                                 if (shouldUpdate) {
                                                     // 取消之前的待更新
                                                     if (pendingUpdate !== null) {
                                                         cancelAnimationFrame(pendingUpdate);
                                                     }
                                                     
                                                     // 使用 requestAnimationFrame 确保在下一帧更新
                                                     pendingUpdate = requestAnimationFrame(() => {
                                                 setMessages(prev => prev.map(m => 
                                                             m.id === aiMessageId ? { ...m, content: accumulatedText, isStreaming: true } : m
                                                         ));
                                                         lastUpdateTime = Date.now();
                                                         pendingUpdate = null;
                                                     });
                                                 } else {
                                                     // 如果还没到更新时间，但需要确保最终会更新
                                                     if (pendingUpdate === null) {
                                                         pendingUpdate = requestAnimationFrame(() => {
                                                             setMessages(prev => prev.map(m => 
                                                                 m.id === aiMessageId ? { ...m, content: accumulatedText, isStreaming: true } : m
                                                 ));
                                                             lastUpdateTime = Date.now();
                                                             pendingUpdate = null;
                                                         });
                                                     }
                                                 }
                                             }
                                         } else if (data.type === 'done') {
                                             aiMessageId = data.messageId || aiMessageId;
                                             setMessages(prev => prev.map(m => 
                                                 m.id === aiMessageId ? { ...m, id: aiMessageId, content: accumulatedText, isStreaming: false } : m
                                             ));
                                             setIsTyping(false);
                                         } else if (data.type === 'error') {
                                             throw new Error(data.error || 'AI generation failed');
                                         }
                                     } catch (e) {
                                         console.error('Failed to parse SSE data:', e);
                                     }
                                 }
                             }
                         }
                         
                         console.log('✅ Message sent successfully with new session ID');
                         
                     } catch (createError: any) {
                         console.error('❌ Failed to create session or resend message:', createError);
                         setMessages(prev => prev.filter(m => m.id !== tempUserMsgId));
                         setIsTyping(false);
                         const errorMsg = language === 'zh' 
                             ? '会话创建失败，请刷新页面或创建新会话' 
                             : 'Failed to create session, please refresh the page or create a new session';
                         setMessages(prev => [...prev, {
                             id: generateId(),
                             type: MessageType.SYSTEM_INFO,
                             content: errorMsg,
                             timestamp: Date.now()
                         }]);
                     }
                 } else {
                     setMessages(prev => prev.filter(m => m.id !== tempUserMsgId));
                     handleError(error, {
                         action: 'send message',
                         component: 'Chat',
                         userId: user.id,
                         sessionId: activeSessionId
                     });
                 }
             } finally {
                 setIsTyping(false);
             }
        } else {
             setIsTyping(false);
        }
    } else {
        // === SCENARIO B: GROUP CHAT (Orchestration) ===
        setProcessingStatus(t.analyzing); 
        await delay(500);

        if (activeProject) {
            setProcessingStatus(language === 'zh' ? `正在读取: ${activeProject.name}...` : `Reading: ${activeProject.name}...`);
            await delay(300); 
            const files = activeProject.data ? Object.keys(activeProject.data).filter(k => k.startsWith('_content_')) : [];
            if (files.length > 0) {
                setProcessingStatus(language === 'zh' ? `分析文件内容...` : `Analyzing file content...`);
                await delay(500);
            }
        }

        setProcessingStatus(null);

        const manualMention = participatingAgents.find(a => userMsg.content.includes(`@${a.name}`));
        if (manualMention) {
            if (manualMention.styles && manualMention.styles.length > 0 && !selectedStyle && !hasDismissedStylePrompt && enableStylePrompt) {
                setIsTyping(false);
                addStyleRequest(manualMention, promptWithContext, undefined, textToSend);
                return;
            }
            handleManualMention(userMsg, manualMention, contextPrefix);
        } else {
            try {
                // 尝试分析意图，如果失败则使用默认值
                let analysis: any;
                try {
                    analysis = await classifyMessageIntent(promptWithContext, participatingAgents.filter(a => a.id !== 'a1'));
                } catch (intentError) {
                    console.warn('Intent classification failed, using default:', intentError);
                    analysis = { type: 'general', contextAnalysis: [], confidence: 0 };
                }
                
                if (showThoughtChainFeature) {
                    const thoughtId = generateId();
                    const initialThought: Message = {
                        id: thoughtId,
                        type: MessageType.THOUGHT_CHAIN,
                        content: '',
                        senderId: 'system',
                        timestamp: Date.now(),
                        thoughtData: {
                            step: 'analyzing',
                            intent: analysis.type,
                            contextUsed: [
                                activeProject ? `Context: ${activeProject.name}` : 'Context: None',
                                ...analysis.contextAnalysis
                            ],
                            targetAgentId: analysis.targetAgentId || 'a1',
                            confidence: analysis.confidence
                        }
                    };
                    
                    setMessages(prev => [...prev, initialThought]);
                    await delay(800);

                    if (analysis.type === 'general') {
                        setMessages(prev => prev.map(m => m.id === thoughtId ? {
                            ...m, thoughtData: { ...m.thoughtData!, step: 'done', targetAgentId: 'a1' }
                        } : m));
                        
                        const nexus = agents.find(a => a.id === 'a1');
                        if (nexus) await triggerAgentResponse(nexus, promptWithContext, undefined, textToSend);

                    } else if (analysis.type === 'task' && analysis.targetAgentId) {
                        const targetAgent = participatingAgents.find(a => a.id === analysis.targetAgentId);
                        
                        if (targetAgent && targetAgent.styles && targetAgent.styles.length > 0 && !selectedStyle && !hasDismissedStylePrompt && enableStylePrompt) {
                            setMessages(prev => prev.map(m => m.id === thoughtId ? {
                                ...m, thoughtData: { ...m.thoughtData!, step: 'routing' } 
                            } : m));
                            
                            setIsTyping(false);
                            addStyleRequest(targetAgent, promptWithContext, thoughtId, textToSend);
                            return; 
                        }

                        setMessages(prev => prev.map(m => m.id === thoughtId ? {
                            ...m, thoughtData: { ...m.thoughtData!, step: 'routing' }
                        } : m));

                        confirmationTimerRef.current = setTimeout(() => {
                            triggerCostConfirmation(analysis.targetAgentId!, analysis.contextAnalysis, promptWithContext);
                            setMessages(prev => prev.map(m => m.id === thoughtId ? {
                                ...m, thoughtData: { ...m.thoughtData!, step: 'done' }
                            } : m));
                        }, 1500); 

                    } else {
                        const nexus = agents.find(a => a.id === 'a1');
                        if (nexus) await triggerAgentResponse(nexus, promptWithContext, undefined, textToSend);
                    }
                } else {
                    if (analysis.type === 'task' && analysis.targetAgentId) {
                        const targetAgent = participatingAgents.find(a => a.id === analysis.targetAgentId);
                        
                        if (targetAgent && targetAgent.styles && targetAgent.styles.length > 0 && !selectedStyle && !hasDismissedStylePrompt && enableStylePrompt) {
                            setIsTyping(false);
                            addStyleRequest(targetAgent, promptWithContext, undefined, textToSend);
                            return;
                        }

                        const agentName = targetAgent ? targetAgent.name : 'Agent';
                        setProcessingStatus(language === 'zh' ? `正在调度 ${agentName}...` : `Routing to ${agentName}...`);
                        setTimeout(() => {
                            setProcessingStatus(null);
                            triggerCostConfirmation(analysis.targetAgentId!, analysis.contextAnalysis, promptWithContext);
                        }, 1200);
                    } else {
                        const nexus = agents.find(a => a.id === 'a1');
                        if (nexus) await triggerAgentResponse(nexus, promptWithContext, undefined, textToSend);
                    }
                }

            } catch (error) {
                console.error("Orchestration failed", error);
                const nexus = agents.find(a => a.id === 'a1');
                if (nexus) await triggerAgentResponse(nexus, promptWithContext, undefined, textToSend);
            }
        }
    }

    // --- PASSIVE CONTEXT UPDATE DETECTION ---
    // Only run if active project exists and message is long enough
    if (activeProject && textToSend.length > 10) {
        detectContextUpdate(textToSend, activeProject.data, language).then(suggestion => {
            if (suggestion) {
                setContextSuggestion(suggestion);
            }
        });
    }
  };

  // ... (Repeated helpers for brevity, same logic as before) ...
  const addStyleRequest = (agent: Agent, originalPrompt: string, relatedThoughtId?: string, userMessage?: string) => {
      const content = JSON.stringify({ agentId: agent.id, agentName: agent.name, agentAvatar: agent.avatar, styles: agent.styles, originalPrompt, relatedThoughtId, userMessage });
      const styleMsg: Message = { id: generateId(), type: MessageType.SYSTEM_STYLE_REQUEST, content, senderId: 'system', timestamp: Date.now() };
      setMessages(prev => [...prev, styleMsg]);
  };

  const handleStyleSelection = (msgId: string, agentId: string, style: string | 'default', originalPrompt: string, relatedThoughtId?: string) => {
      setMessages(prev => prev.filter(m => m.id !== msgId));
      const agent = agents.find(a => a.id === agentId);
      if (!agent) return;
      let finalPrompt = originalPrompt;
      if (style !== 'default') {
          setSelectedStyle(style); 
          finalPrompt = `[Style/Tone Instruction: Please use a "${style}" style for this response]\n\n${originalPrompt}`;
      }
      setHasDismissedStylePrompt(true);
      if (relatedThoughtId) {
          setMessages(prev => prev.map(m => m.id === relatedThoughtId ? { ...m, thoughtData: { ...m.thoughtData!, step: 'done' } } : m));
      }
      let userMessage = '';
      try { const contentObj = JSON.parse(messages.find(m => m.id === msgId)?.content || '{}'); if (contentObj.userMessage) userMessage = contentObj.userMessage; } catch(e) {}
      if (!activeSession.isGroup) triggerAgentResponse(agent, finalPrompt, undefined, userMessage);
      else triggerCostConfirmation(agentId, [style !== 'default' ? `Style: ${style}` : 'Style: Default'], finalPrompt);
  };

  const triggerCostConfirmation = (targetAgentId: string, contextLines: string[], fullPrompt: string) => {
      const targetAgent = participatingAgents.find(a => a.id === targetAgentId);
      if (!targetAgent) return;
      setIsTyping(false);
      const targetName = language === 'zh' ? (targetAgent.role_zh || targetAgent.name) : targetAgent.name;
      const confirmMsg: Message = {
          id: generateId(), type: MessageType.SYSTEM_COST_CONFIRM, content: JSON.stringify({ agentName: targetAgent.name, agentDisplayName: targetName, agentAvatar: targetAgent.avatar, contextLines, preparedPrompt: fullPrompt }), 
          senderId: 'system', timestamp: Date.now(), cost: targetAgent.pricePerMessage, relatedAgentId: targetAgent.id,
      };
      setMessages(prev => [...prev, confirmMsg]);
  };

  const handleManualMention = (userMsg: Message, mentionedAgent: Agent, contextPrefix: string) => {
      setIsTyping(false);
      const targetName = language === 'zh' ? (mentionedAgent.role_zh || mentionedAgent.name) : mentionedAgent.name;
      const organizingMsg: Message = { id: generateId(), type: MessageType.AGENT, content: language === 'zh' ? `收到。呼叫 **${targetName}** ...` : `Copy that. Calling **${targetName}**...`, senderId: 'a1', senderName: t.orchestratorName, senderAvatar: agents[0].avatar, timestamp: Date.now() };
      setMessages(prev => [...prev, organizingMsg]);
      setTimeout(() => triggerCostConfirmation(mentionedAgent.id, [t.selectAgent + ': ' + mentionedAgent.name], ''), 500);
  };

  const triggerAgentResponse = async (agent: Agent, fullPrompt: string, existingMessageId?: string, originalUserMessage?: string) => {
    setIsTyping(true); 
    setProcessingStatus(null); 
    abortControllerRef.current = new AbortController();
    
    const responseId = existingMessageId || generateId();
    let displayName = language === 'zh' ? (agent.role_zh || agent.name) : agent.name;
    
    // 乐观更新：立即显示 AI 响应占位符
    if (!existingMessageId) {
        const initialResponse: Message = { 
            id: responseId, 
            type: MessageType.AGENT, 
            content: '', 
            senderId: agent.id, 
            senderName: displayName, 
            senderAvatar: agent.avatar, 
            timestamp: Date.now(), 
            isStreaming: true 
        };
        setMessages(prev => [...prev, initialResponse]);
    } else { 
        setMessages(prev => prev.map(m => m.id === responseId ? { ...m, isStreaming: true, content: '' } : m)); 
    }
    
    let accumulatedText = '';
    let finalMessageId = responseId;

    try {
        // 使用后端 SSE API 发送消息
        const response = await retryWithBackoff(
            () => api.messages.send(activeSessionId, originalUserMessage || fullPrompt, {
                agentId: agent.id,
                modelOverride: selectedModel,
                contextData: activeProject?.data
            }),
            3,
            1000
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // 处理 SSE 流式响应
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Failed to get response reader');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let lastUpdateTime = Date.now();
        const UPDATE_THROTTLE = 16; // 每 16ms 更新一次 UI（约60fps），实现流畅的打字效果
        let pendingUpdate: number | null = null;

        while (true) {
            if (abortControllerRef.current?.signal.aborted) {
                reader.cancel();
                if (pendingUpdate !== null) {
                    cancelAnimationFrame(pendingUpdate);
                }
                break;
            }

            const { done, value } = await reader.read();

            // 处理接收到的数据
            if (value) {
            buffer += decoder.decode(value, { stream: true });
            }
            
            // 如果流结束，处理剩余的 buffer
            if (done) {
                // 取消任何待处理的更新
                if (pendingUpdate !== null) {
                    cancelAnimationFrame(pendingUpdate);
                    pendingUpdate = null;
                }
                
                // 处理 buffer 中剩余的所有内容
                const allLines = buffer.split('\n');
                for (const line of allLines) {
                    if (line.trim() && line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            
                            if (data.type === 'chunk') {
                                accumulatedText += data.content;
                            } else if (data.type === 'done') {
                                finalMessageId = data.messageId || responseId;
                            }
                        } catch (e) {
                            console.error('Failed to parse final SSE data:', e);
                        }
                    }
                }
                
                // 确保最终内容已更新
                setMessages(prev => prev.map(m => {
                    if (m.id === responseId) {
                        return { ...m, id: finalMessageId, content: accumulatedText, isStreaming: false };
                    }
                    return m;
                }));
                break;
            }

            // 处理 buffer 中的完整行
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.substring(6));
                        
                        if (data.type === 'chunk') {
                            accumulatedText += data.content;
                            
                            // 使用 requestAnimationFrame 实现流畅的打字效果
                            const now = Date.now();
                            const shouldUpdate = now - lastUpdateTime >= UPDATE_THROTTLE;
                            
                            if (shouldUpdate) {
                                // 取消之前的待更新
                                if (pendingUpdate !== null) {
                                    cancelAnimationFrame(pendingUpdate);
                                }
                                
                                // 使用 requestAnimationFrame 确保在下一帧更新
                                pendingUpdate = requestAnimationFrame(() => {
                            setMessages(prev => prev.map(m => 
                                        m.id === responseId ? { ...m, content: accumulatedText, isStreaming: true } : m
                                    ));
                                    lastUpdateTime = Date.now();
                                    pendingUpdate = null;
                                });
                            } else {
                                // 如果还没到更新时间，但需要确保最终会更新
                                if (pendingUpdate === null) {
                                    pendingUpdate = requestAnimationFrame(() => {
                                        setMessages(prev => prev.map(m => 
                                            m.id === responseId ? { ...m, content: accumulatedText, isStreaming: true } : m
                            ));
                                        lastUpdateTime = Date.now();
                                        pendingUpdate = null;
                                    });
                                }
                            }
                        } else if (data.type === 'done') {
                            // 取消任何待处理的更新
                            if (pendingUpdate !== null) {
                                cancelAnimationFrame(pendingUpdate);
                                pendingUpdate = null;
                            }
                            
                            finalMessageId = data.messageId || responseId;
                            // 更新消息 ID 为数据库返回的 ID
                            setMessages(prev => prev.map(m => 
                                m.id === responseId ? { ...m, id: finalMessageId, content: accumulatedText, isStreaming: false } : m
                            ));
                        } else if (data.type === 'error') {
                            throw new Error(data.error || 'AI generation failed');
                        }
                    } catch (e) {
                        console.error('Failed to parse SSE data:', e);
                    }
                }
            }
        }
        
        // 生成后续问题（如果启用）
        if (showFollowUps && originalUserMessage && accumulatedText.length > 50) {
            try {
                const followUps = await generateFollowUpQuestions(originalUserMessage, accumulatedText, language);
                if (followUps && followUps.length > 0) {
                    setMessages(prev => prev.map(m => 
                        m.id === finalMessageId ? { ...m, suggestedFollowUps: followUps } : m
                    ));
                }
            } catch (e) {
                console.error("Smart Followup Error", e);
            }
        }
    } catch (error: any) {
        // 错误处理：回滚乐观更新
        setMessages(prev => prev.filter(m => m.id !== responseId));
        handleError(error, {
            action: 'send message',
            component: 'Chat',
            userId: user.id,
            sessionId: activeSessionId
        });
    } finally {
        setIsTyping(false);
        abortControllerRef.current = null;
    }
  };

  const handleRegenerate = async (message: Message, mode: string) => {
      const msgIndex = messages.findIndex(m => m.id === message.id);
      const userMsg = messages.slice(0, msgIndex).reverse().find(m => m.type === MessageType.USER);
      if (!userMsg) return;
      const agent = agents.find(a => a.id === message.senderId);
      if (!agent) return;
      let promptWithContext = buildContextPrompt(activeProject) ? `${buildContextPrompt(activeProject)}\n\nUser Question: ${userMsg.content}` : userMsg.content;
      let modifier = '';
      if (mode.startsWith('style:')) modifier = ` (Rewrite your response using a "${mode.replace('style:', '')}" style/tone)`;
      else { switch(mode) { case 'shorter': modifier = " (Rewrite your response to be shorter and more concise)"; break; case 'longer': modifier = " (Rewrite your response to be more detailed and comprehensive)"; break; case 'casual': modifier = " (Rewrite your response using a casual, friendly tone)"; break; case 'professional': modifier = " (Rewrite your response using a strictly professional tone)"; break; default: modifier = " (Regenerate your previous response)"; } }
      promptWithContext += `\n\n[SYSTEM INSTRUCTION: ${modifier}]`;
      await triggerAgentResponse(agent, promptWithContext, message.id, userMsg.content);
  };

  const handleFeedback = async (messageId: string, type: 'like' | 'dislike') => {
    // 乐观更新：立即更新 UI
    const currentFeedback = messages.find(m => m.id === messageId)?.feedback;
    const newFeedback = currentFeedback === type ? null : type;
    
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, feedback: newFeedback } : m));
    
    // 保存到数据库
    try {
      await api.messages.updateFeedback(messageId, newFeedback || type);
    } catch (error: any) {
      // 回滚：恢复原来的反馈状态
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, feedback: currentFeedback } : m));
      handleError(error, {
        action: 'update feedback',
        component: 'Chat',
        userId: user.id,
        sessionId: activeSessionId
      });
    }
  };
  const handleCostConfirm = async (msgId: string, agentId: string, cost: number) => {
    const agent = agents.find(a => a.id === agentId);
    const displayName = language === 'zh' && agent?.role_zh ? agent.role_zh : agent?.name;
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, type: MessageType.SYSTEM_INFO, content: `${t.authorizedTo} ${displayName}. ${t.deducted}: ${cost}.` } : m));
    onUpdateCredits(user.credits - cost);
    if (agent) {
        const lastUserMsg = [...messages].reverse().find(m => m.type === MessageType.USER);
        if (lastUserMsg) {
            let finalPrompt = '';
            try { const contentObj = JSON.parse(messages.find(m => m.id === msgId)?.content || '{}'); if (contentObj.preparedPrompt) finalPrompt = contentObj.preparedPrompt; } catch(e) {}
            if (!finalPrompt) finalPrompt = buildContextPrompt(activeProject) ? `${buildContextPrompt(activeProject)}\n\nUser Request: ${lastUserMsg.content.replace(`@${agent.name}`, '').trim()}` : lastUserMsg.content.replace(`@${agent.name}`, '').trim();
            await triggerAgentResponse(agent, finalPrompt, undefined, lastUserMsg.content);
        }
    }
  };
  const handleCostCancel = (msgId: string) => { setMessages(prev => prev.map(m => m.id === msgId ? { ...m, type: MessageType.SYSTEM_INFO, content: t.requestCancelled } : m)); setIsTyping(false); };
  const selectAgent = (agentName: string) => { setInput(prev => prev + agentName + ' '); setShowAgentSelector(false); inputRef.current?.focus(); };
  const replacePlaceholders = (template: string, data: Record<string, any>) => template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ? String(data[key]) : `[${key}]`);
  const getIcon = (name: string) => { switch(name) { case 'PenTool': return <PenTool size={16} />; case 'Mail': return <Mail size={16} />; case 'BarChart': return <BarChart size={16} />; case 'Cpu': return <Cpu size={16} />; default: return <Zap size={16} />; } }
  const getQuickActions = () => { if (!activeProject) return []; const data = activeProject.data || {}; return promptTemplates.map(template => ({ label: replacePlaceholders(template.label, data), prompt: replacePlaceholders(template.prompt, data), icon: template.icon })); };
  const activeContextKeys = activeProject?.data ? Object.keys(activeProject.data).filter(k => k !== 'documents' && !k.startsWith('_content_') && !k.startsWith('_successful_examples_') && activeProject.data[k]) : [];
  const renderZeroState = () => {
      const actions = getQuickActions();
      return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in opacity-0" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl mb-6"><Zap size={32} className="text-white fill-white"/></div>
              <h2 className="text-2xl font-bold text-textMain mb-2">{language === 'zh' ? '你好，我能帮你做什么？' : 'Hello, how can I help you today?'}</h2>
              <p className="text-textSecondary text-sm max-w-md mb-8">{activeProject ? (language === 'zh' ? `当前上下文: ${activeProject.name}` : `Active Context: ${activeProject.name}`) : (language === 'zh' ? '开始对话或选择一个快捷指令' : 'Start a conversation or choose a quick action')}</p>
              {activeProject && (<div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">{actions.map((action, idx) => (<button key={idx} onClick={() => handleSend(action.prompt)} className="flex items-center gap-3 p-4 bg-surface border border-border hover:border-primary/50 rounded-xl text-left transition-all hover:shadow-lg hover:shadow-primary/10 group"><div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center group-hover:text-primary transition-colors border border-border">{getIcon(action.icon)}</div><div className="flex-1 min-w-0"><div className="font-bold text-textMain text-sm truncate">{action.label}</div><div className="text-xs text-textSecondary truncate opacity-70">{action.prompt.substring(0, 40)}...</div></div></button>))}</div>)}
          </div>
      );
  };
  const getSelectedModelName = () => { const found = availableModels.find(m => m.id === selectedModel); return found ? found.name : (selectedModel || 'Default Model'); };
  const AgentProfileModal = () => { if (!viewingAgent) return null; const role = language === 'zh' ? (viewingAgent.role_zh || viewingAgent.role) : viewingAgent.role; const description = language === 'zh' ? (viewingAgent.description_zh || viewingAgent.description) : viewingAgent.description; return (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setViewingAgent(null)}><div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}><div className="h-24 bg-gradient-to-r from-primary/20 to-accent/20"></div><div className="px-6 pb-6 -mt-12 flex flex-col items-center text-center"><div className="w-2 h-2 rounded-2xl bg-surface p-1 border border-border shadow-lg mb-4"><img src={viewingAgent.avatar} className="w-full h-full object-cover rounded-xl bg-black/20" alt={viewingAgent.name}/></div><h2 className="text-xl font-bold text-textMain">{viewingAgent.name}</h2><div className="flex items-center gap-2 mt-1 mb-4"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 uppercase">{role}</span><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface border border-border text-textSecondary">{viewingAgent.category}</span></div><p className="text-sm text-textSecondary mb-6 line-clamp-4 leading-relaxed">{description}</p><div className="w-full grid grid-cols-2 gap-3 mb-6"><div className="bg-background p-3 rounded-xl border border-border"><div className="text-[10px] text-textSecondary uppercase font-bold mb-1">{language === 'zh' ? '价格' : 'Price'}</div><div className="text-sm font-mono text-textMain">{viewingAgent.pricePerMessage} <span className="text-[10px] text-textSecondary">{t.perMsg || 'msg'}</span></div></div><div className="bg-background p-3 rounded-xl border border-border"><div className="text-[10px] text-textSecondary uppercase font-bold mb-1">{language === 'zh' ? '知识库' : 'Knowledge'}</div><div className="text-sm font-mono text-textMain">{viewingAgent.knowledgeFiles?.length || 0} <span className="text-[10px] text-textSecondary">Files</span></div></div></div><button onClick={() => { if (onStartPrivateChat) onStartPrivateChat(viewingAgent.id); setViewingAgent(null); }} className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 active:scale-95"><MessageSquare size={18}/>{language === 'zh' ? '开始私聊' : 'Start Private Chat'}</button></div><button onClick={() => setViewingAgent(null)} className="absolute top-3 right-3 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-md"><X size={16}/></button></div></div>); };

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {viewingAgent && <AgentProfileModal />}

      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-surface/80 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-3">
          {activeSession.isGroup ? (
              <div className="flex -space-x-2">
                 {participatingAgents.slice(0, 4).map(a => (
                    <img 
                        key={a.id} 
                        src={a.avatar} 
                        alt={a.name} 
                        className="w-8 h-8 rounded-full border-2 border-surface cursor-pointer hover:scale-110 transition-transform hover:z-10" 
                        title={a.name}
                        onClick={() => setViewingAgent(a)}
                    />
                 ))}
                 {participatingAgents.length > 4 && (
                     <div className="w-8 h-8 rounded-full border-2 border-surface bg-background flex items-center justify-center text-[10px] font-bold text-textSecondary">
                         +{participatingAgents.length - 4}
                     </div>
                 )}
              </div>
          ) : (
              participatingAgents[0] ? (
                 <img 
                    src={participatingAgents[0].avatar} 
                    alt={participatingAgents[0].name} 
                    className="w-10 h-10 rounded-xl border border-border cursor-pointer hover:opacity-80 transition-opacity" 
                    onClick={() => setViewingAgent(participatingAgents[0])}
                 />
              ) : (
                 <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              )
          )}
          
          <div className="flex flex-col">
            <h2 className="text-textMain font-semibold flex items-center gap-2 text-sm md:text-base">
                {activeSession.isGroup && <Users size={16} className="text-accent" />}
                {activeSession.title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-textSecondary overflow-hidden">
                <span className="hidden md:inline">{activeSession.isGroup ? `${t.members}: ${participatingAgents.length}` : `${t.project}: ${activeSessionId.substring(0,8)}...`}</span>
                <span className="text-border hidden md:inline">|</span>
                {activeProject ? (
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20 cursor-help" title={`Active Context: ${activeProject.name}`}>
                            <Briefcase size={10} />
                            <span className="text-[10px] font-bold max-w-[80px] md:max-w-[120px] truncate">{activeProject.name}</span>
                        </div>
                        {activeContextKeys.length > 0 && <span className="text-[10px] text-emerald-500">● Data</span>}
                    </div>
                ) : (
                    <div className="flex items-center gap-1 text-textSecondary text-[10px] italic">
                        <AlertCircle size={10} />
                        <span>{language === 'zh' ? '无上下文' : 'No Context'}</span>
                    </div>
                )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
            {/* WebSocket切换按钮（类似大公司的实现）- 仅在管理后台启用时显示 */}
            {enableWebSocketButton && (
            <button 
                onClick={() => {
                    const newValue = !useWebSocket;
                    setUseWebSocket(newValue);
                    if (newValue) {
                        websocketClient.connect().catch((error) => {
                            console.error('WebSocket connection failed:', error);
                            setUseWebSocket(false);
                            alert(language === 'zh' ? 'WebSocket连接失败，已回退到SSE' : 'WebSocket connection failed, falling back to SSE');
                        });
                    } else {
                        websocketClient.disconnect();
                    }
                }}
                className={`p-2 rounded-lg transition-colors ${useWebSocket ? 'bg-primary text-white' : 'text-textSecondary hover:text-primary hover:bg-background'}`}
                title={language === 'zh' ? (useWebSocket ? '使用WebSocket（已启用，类似ChatGPT）' : '切换到WebSocket（类似ChatGPT、Claude）') : (useWebSocket ? 'WebSocket Enabled (like ChatGPT)' : 'Switch to WebSocket (like ChatGPT/Claude)')}
            >
                <Zap size={18} />
            </button>
            )}
            
            {showSimulator && (
                <button 
                    onClick={() => {
                        setSimulatorData(undefined);
                        setIsSimulatorOpen(!isSimulatorOpen);
                    }}
                    className={`p-2 rounded-lg transition-colors border border-transparent ${isSimulatorOpen ? 'bg-[#ff2442] text-white' : 'text-textSecondary hover:text-[#ff2442] hover:bg-[#ff2442]/10 hover:border-[#ff2442]/20'}`}
                    title={t.openSim}
                >
                    <LayoutTemplate size={18} />
                </button>
            )}

            {showContextDrawerFeature && (
                <button 
                    onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                    className={`p-2 rounded-lg transition-colors ${isDrawerOpen ? 'bg-primary text-white' : 'text-textSecondary hover:text-primary hover:bg-background'}`}
                    title={t.contextPanel}
                >
                    <BookOpen size={18} />
                </button>
            )}

            {allowModelSelect && (
                <div className="relative">
                    <button 
                        onClick={() => setShowModelMenu(!showModelMenu)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-medium text-textMain hover:border-primary transition-all"
                    >
                        <Bot size={14} className="text-primary"/>
                        <span className="max-w-[100px] truncate">{getSelectedModelName()}</span>
                        <ChevronDown size={12} className="text-textSecondary"/>
                    </button>
                    {showModelMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowModelMenu(false)}></div>
                            <div className="absolute top-full right-0 mt-2 w-48 bg-surface border border-border rounded-xl shadow-xl z-20 overflow-hidden animate-slide-up">
                                <div className="p-2 space-y-1">
                                    {availableModels.map(model => (
                                        <button
                                            key={model.id}
                                            onClick={() => {
                                                setSelectedModel(model.id);
                                                setShowModelMenu(false);
                                            }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors
                                                ${selectedModel === model.id ? 'bg-primary text-white' : 'text-textMain hover:bg-background'}`}
                                        >
                                            {model.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            <button 
                onClick={() => {
                    logger.downloadLogs('text');
                    alert(language === 'zh' ? `日志已下载: ${logger.getLogFilePath()}` : `Logs downloaded: ${logger.getLogFilePath()}`);
                }} 
                className="p-2 text-textSecondary hover:text-primary rounded-lg hover:bg-background transition-colors" 
                title={language === 'zh' ? '下载调试日志（包含所有错误和调试信息）' : 'Download Debug Logs (includes all errors and debug info)'}
            >
                <FileText size={18} />
            </button>
            <button onClick={handleClearHistory} className="p-2 text-textSecondary hover:text-red-500 rounded-lg hover:bg-background transition-colors" title="Clear Chat">
                <Trash2 size={18} />
            </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 flex flex-col min-w-0">
              
              {/* CHAT LOG */}
              <div 
                className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide"
                ref={chatContainerRef} // Attached Ref
              >
                {messages.length <= 1 ? renderZeroState() : null}

                {messages.map((msg, index) => {
                    const isLastMessage = index === messages.length - 1;

                    if (msg.type === MessageType.THOUGHT_CHAIN && msg.thoughtData) {
                        const { step, intent, targetAgentId, confidence, manualOverride } = msg.thoughtData;
                        const isDone = step === 'done';
                        
                        return (
                            <div key={msg.id} className="w-full flex justify-center my-6 animate-fade-in">
                                <div className="bg-surface/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 w-full max-w-lg shadow-sm">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`p-2 rounded-lg bg-accent/10 border border-accent/20 ${!isDone ? 'animate-pulse' : ''}`}>
                                            <Sparkles size={16} className="text-accent"/>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-textMain uppercase tracking-wider flex items-center gap-2">
                                                Nexus Core
                                                {!isDone && <span className="w-1.5 h-1.5 bg-accent rounded-full animate-ping"/>}
                                            </h4>
                                            <p className="text-[10px] text-textSecondary">Orchestration & Reasoning Engine</p>
                                        </div>
                                    </div>
                                    <div className="pl-2 space-y-5">
                                        <div className="text-xs text-textSecondary">Thinking Process... (Step: {step})</div>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (msg.type === MessageType.SYSTEM_STYLE_REQUEST) {
                        let details; try { details = JSON.parse(msg.content); } catch(e) { details = { styles: [] }; }
                        return (
                            <div key={msg.id} className="flex justify-start w-full my-4 animate-slide-up">
                                <div className="ml-11 max-w-md w-full bg-surface border border-border rounded-xl overflow-hidden shadow-2xl relative">
                                    <div className="h-1 bg-gradient-to-r from-pink-500 to-violet-500"></div>
                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-violet-500/20 flex items-center justify-center border border-pink-500/20">
                                                    <Palette size={20} className="text-pink-500"/>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-textSecondary uppercase font-bold tracking-wider">{language === 'zh' ? '风格选择' : 'Style Selection'}</p>
                                                    <p className="text-sm font-bold text-textMain">{details.agentDisplayName || details.agentName}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {details.styles && details.styles.map((style: string, idx: number) => (
                                                <button key={idx} onClick={() => handleStyleSelection(msg.id, details.agentId, style, details.originalPrompt, details.relatedThoughtId)} className="px-3 py-2 bg-background hover:bg-primary hover:text-white border border-border rounded-lg text-xs font-bold transition-all text-left flex items-center justify-between group">{style}</button>
                                            ))}
                                            <button onClick={() => handleStyleSelection(msg.id, details.agentId, 'default', details.originalPrompt, details.relatedThoughtId)} className="col-span-2 mt-1 px-3 py-2 bg-surface hover:bg-background border border-border rounded-lg text-xs text-textSecondary hover:text-textMain transition-all text-center">{language === 'zh' ? '默认风格 (跳过)' : 'Default Style (Skip)'}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (msg.type === MessageType.SYSTEM_COST_CONFIRM) {
                        let details; try { details = JSON.parse(msg.content); } catch(e) { details = { agentName: 'Agent', agentDisplayName: 'Agent', agentAvatar: '', contextLines: [] }; }
                        return (
                            <div key={msg.id} className="flex justify-start w-full my-4">
                                <div className="ml-11 max-w-md w-full bg-surface border border-border rounded-xl overflow-hidden shadow-lg animate-fade-in relative group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <img src={details.agentAvatar} alt="Target" className="w-12 h-12 rounded-xl bg-black/20 object-cover shadow-sm"/>
                                                <div>
                                                    <p className="text-[10px] text-textSecondary uppercase font-bold tracking-wider">{t.taskConfirm}</p>
                                                    <p className="text-lg font-bold text-textMain">{details.agentDisplayName || details.agentName}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-bold text-primary">{msg.cost}</div>
                                                <div className="text-[10px] text-textSecondary uppercase">{tCommon.credits}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => handleCostCancel(msg.id)} className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-textSecondary hover:bg-background hover:text-textMain transition-all text-sm font-medium border border-transparent hover:border-border"><X size={16} /> {tCommon.cancel}</button>
                                            <button onClick={() => handleCostConfirm(msg.id, msg.relatedAgentId!, msg.cost!)} className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white font-bold hover:brightness-110 shadow-lg shadow-primary/20 transition-all text-sm"><CheckCircle size={16} /> {tCommon.confirmRun}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={msg.id} className={`flex flex-col ${msg.type === MessageType.USER ? 'items-end' : 'items-start'} mb-4`}>
                            <div className={`flex ${msg.type === MessageType.USER ? 'flex-row-reverse' : 'flex-row'} max-w-[85%] md:max-w-[75%]`}>
                                {msg.type !== MessageType.USER && msg.type !== MessageType.SYSTEM_INFO && (
                                <div 
                                    className="w-8 h-8 rounded-lg bg-surface mr-3 flex-shrink-0 border border-border overflow-hidden mt-1 shadow-sm cursor-pointer hover:scale-105 transition-transform"
                                    onClick={() => {
                                        if (msg.senderId) {
                                            const agent = agents.find(a => a.id === msg.senderId);
                                            if (agent) setViewingAgent(agent);
                                        }
                                    }}
                                >
                                    {msg.senderAvatar ? <img src={msg.senderAvatar} alt="bot" className="w-full h-full object-cover"/> : <Bot size={18} className="m-auto text-textSecondary"/>}
                                </div>
                                )}

                                {msg.type === MessageType.USER && (
                                <div className="w-8 h-8 rounded-lg bg-surface ml-3 flex-shrink-0 border border-border overflow-hidden mt-1 shadow-sm">
                                    <img src={user.avatar} alt="me" className="w-full h-full object-cover"/>
                                </div>
                                )}

                                <div className="flex-1 min-w-0">
                                    {msg.type !== MessageType.USER && msg.type !== MessageType.SYSTEM_INFO && (
                                        <div className="text-xs text-textSecondary ml-1 mb-1 flex items-center gap-2">
                                            {msg.senderName || t.system}
                                            {msg.type === MessageType.AGENT && <span className="px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] text-textSecondary">{t.ai}</span>}
                                        </div>
                                    )}

                                    {msg.type === MessageType.SYSTEM_INFO ? (
                                        <div className="flex items-center gap-2 text-textSecondary text-xs italic justify-center w-full my-4">
                                            <AlertCircle size={12} />
                                            {msg.content}
                                        </div>
                                    ) : (
                                        <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed markdown-body relative group
                                            ${msg.type === MessageType.USER 
                                                ? 'bg-primary text-white rounded-tr-sm' 
                                                : 'bg-surface border border-border text-textMain rounded-tl-sm'
                                            }`}
                                        >
                                            <ReactMarkdown 
                                                remarkPlugins={[remarkGfm]} 
                                                components={{ code({node, inline, className, children, ...props}: any) { const match = /language-(\w+)/.exec(className || ''); return !inline && match ? ( <div className="relative group/code my-4 rounded-lg overflow-hidden border border-border bg-[#1e1e1e]"> <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-white/10"> <span className="text-[10px] text-gray-400 uppercase font-mono">{match[1]}</span> <button onClick={() => handleCopyCode(String(children).replace(/\n$/, ''))} className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-white transition-colors"> <Copy size={12} /> Copy </button> </div> <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }} {...props}> {String(children).replace(/\n$/, '')} </SyntaxHighlighter> </div> ) : ( <code className={className} {...props}> {children} </code> ) } }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                            {msg.isStreaming && ( <span className="inline-block w-2 h-4 ml-1 align-middle bg-textSecondary animate-pulse">|</span> )}

                                            {msg.type === MessageType.AGENT && !msg.isStreaming && showRichActions && (
                                                <div className="absolute -bottom-7 left-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleCopyCode(msg.content)} className="p-1 text-textSecondary hover:text-textMain hover:bg-background rounded" title="Copy Text"> <Copy size={14} /> </button>
                                                    {/* NEW: Send to Simulator Action */}
                                                    {showSimulator && (
                                                        <button 
                                                            onClick={() => sendToSimulator(msg.content)} 
                                                            className="p-1 text-textSecondary hover:text-[#ff2442] hover:bg-background rounded flex items-center gap-1"
                                                            title={language === 'zh' ? '发送到小红书模拟器' : 'Send to Simulator'}
                                                        > 
                                                            <LayoutTemplate size={14} /> 
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleRegenerate(msg, 'retry')} className="p-1 text-textSecondary hover:text-primary hover:bg-background rounded flex items-center gap-1"> <RefreshCw size={14} /> </button>
                                                    <button onClick={() => handleFeedback(msg.id, 'like')} className={`p-1 rounded hover:bg-background ${msg.feedback === 'like' ? 'text-green-500' : 'text-textSecondary hover:text-green-500'}`}> <ThumbsUp size={14} /> </button>
                                                    <button onClick={() => handleFeedback(msg.id, 'dislike')} className={`p-1 rounded hover:bg-background ${msg.feedback === 'dislike' ? 'text-red-500' : 'text-textSecondary hover:text-red-500'}`}> <ThumbsDown size={14} /> </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 交互式选项（信息收集时使用） */}
                            {msg.type === MessageType.AGENT && !msg.isStreaming && msg.interactiveOptions && msg.interactiveOptions.length > 0 && (
                                <div className="mt-3 ml-11 pr-4">
                                    <div className="text-xs text-textSecondary mb-2 font-bold">
                                        {language === 'zh' ? '请选择：' : 'Please select:'}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {msg.interactiveOptions.map((option: any, i: number) => (
                                            <button
                                                key={i}
                                                onClick={() => handleSend(option.value || option.label)}
                                                className="text-left px-4 py-3 bg-surface border border-border hover:border-primary hover:bg-primary/10 rounded-lg transition-all flex items-start gap-2 shadow-sm hover:shadow-md group"
                                            >
                                                <div className="flex-1">
                                                    <div className="text-sm font-bold text-textMain group-hover:text-primary">
                                                        {option.label}
                                                    </div>
                                                    {option.description && (
                                                        <div className="text-xs text-textSecondary mt-1">
                                                            {option.description}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                                    →
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 后续问题建议 */}
                            {msg.type === MessageType.AGENT && !msg.isStreaming && showFollowUps && msg.suggestedFollowUps && (
                                <div className="flex gap-2 mt-2 ml-11 overflow-x-auto w-full pr-4 pb-2 scrollbar-hide">
                                    {msg.suggestedFollowUps.map((q, i) => (
                                        <button key={i} onClick={() => handleSend(q)} className="whitespace-nowrap px-3 py-1.5 bg-surface border border-border hover:border-primary/50 hover:bg-primary/5 text-primary text-xs rounded-full transition-all flex items-center gap-1.5 shadow-sm"> <Lightbulb size={12} /> {q} </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                
                {/* 等待 AI 回复的动画指示器 */}
                {isTyping && !messages.some(msg => msg.isStreaming) && (
                    <div className="flex justify-start w-full animate-fade-in mb-4">
                        <div className="flex items-center gap-3 ml-11">
                            <div className="w-8 h-8 rounded-lg bg-surface border border-border overflow-hidden shadow-sm flex-shrink-0">
                                {agents.find(a => a.id === activeSession.participants?.[0])?.avatar ? (
                                    <img 
                                        src={agents.find(a => a.id === activeSession.participants?.[0])?.avatar} 
                                        alt="agent" 
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <Bot size={18} className="m-auto text-textSecondary"/>
                                )}
                            </div>
                            <div className="bg-surface border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="flex gap-1.5">
                                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.4s' }}></span>
                                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.4s' }}></span>
                                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.4s' }}></span>
                                    </div>
                                    <span className="text-xs text-textSecondary ml-1">{language === 'zh' ? '正在思考...' : 'Thinking...'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {processingStatus && (
                    <div className="flex justify-start w-full animate-fade-in pl-12">
                        <div className="bg-surface/50 border border-border/50 rounded-xl p-3 flex items-center gap-3 backdrop-blur-sm shadow-sm">
                            <Loader2 className="w-4 h-4 text-primary animate-spin" />
                            <span className="text-xs font-bold text-textMain">{processingStatus}</span>
                        </div>
                    </div>
                )}

                {/* CONTEXT UPDATE SUGGESTION TOAST */}
                {contextSuggestion && (
                    <div className="flex justify-start w-full animate-slide-up pl-11 mb-4">
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 w-full max-w-md shadow-lg backdrop-blur-md">
                            <div className="flex items-center gap-2 mb-2 text-emerald-500 font-bold text-sm">
                                <Sparkles size={16}/>
                                {language === 'zh' ? '检测到上下文变更' : 'Context Update Detected'}
                            </div>
                            <p className="text-xs text-textSecondary mb-3">
                                {language === 'zh' 
                                    ? `是否将 **${contextSuggestion.key}** 从 "${contextSuggestion.oldValue}" 更新为:`
                                    : `Should we update **${contextSuggestion.key}** from "${contextSuggestion.oldValue}" to:`}
                            </p>
                            <div className="bg-background/50 p-2 rounded text-sm text-textMain font-mono border border-border/50 mb-3">
                                {contextSuggestion.newValue}
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={handleApplyContextSuggestion}
                                    className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:brightness-110 flex items-center justify-center gap-2"
                                >
                                    <CheckCircle size={14}/> {language === 'zh' ? '确认更新' : 'Update Context'}
                                </button>
                                <button 
                                    onClick={() => setContextSuggestion(null)}
                                    className="px-4 py-2 bg-surface hover:bg-background border border-border rounded-lg text-xs font-medium text-textSecondary"
                                >
                                    {language === 'zh' ? '忽略' : 'Ignore'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 bg-background border-t border-border">
                <div className="max-w-4xl mx-auto relative">
                    {activeStyleAgent && ( <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-hide"> <div className="flex items-center text-[10px] font-bold text-textSecondary uppercase mr-1"> <Palette size={10} className="mr-1"/> {t.styles || 'Styles'}: </div> {activeStyleAgent.styles?.map((style, idx) => ( <button key={idx} onClick={() => setSelectedStyle(selectedStyle === style ? null : style)} className={`px-3 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${selectedStyle === style ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface border-border text-textMain hover:border-primary/50'}`}> {style} </button> ))} </div> )}
                    {showAgentSelector && activeSession.isGroup && ( <div className="absolute bottom-full left-0 mb-2 w-64 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-10 animate-slide-up"> <div className="bg-background px-3 py-2 text-xs font-bold text-textSecondary uppercase tracking-wider"> {t.selectAgent} </div> {participatingAgents.filter(a => a.id !== 'a1').map(agent => ( <button key={agent.id} onClick={() => selectAgent(agent.name)} className="w-full text-left px-4 py-3 hover:bg-background flex items-center gap-3 transition-colors border-b border-border last:border-0"> <img src={agent.avatar} className="w-6 h-6 rounded bg-black/20" alt={agent.name}/> <div> <p className="text-sm font-medium text-textMain">{agent.name}</p> </div> </button> ))} </div> )}

                    <div className={`bg-surface border ${selectedStyle ? 'border-primary ring-1 ring-primary/20' : 'border-border'} rounded-2xl flex items-end p-2 shadow-lg focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all`}>
                        <button className="p-2 text-textSecondary hover:text-textMain transition-colors"> <Paperclip size={20} /> </button>
                        <textarea 
                            ref={inputRef} 
                            value={input} 
                            onChange={(e) => setInput(e.target.value)} 
                            onKeyDown={(e) => { 
                                console.log('⌨️ Key pressed:', e.key, 'activeSessionId:', activeSessionId);
                                // Enter发送，Shift+Enter换行
                                if (e.key === 'Enter' && !e.shiftKey) { 
                                    e.preventDefault(); 
                                    if (input.trim() && !isTyping) {
                                        console.log('⌨️ Enter pressed, calling handleSend');
                                        handleSend(); 
                                    }
                                } 
                            }}
                            onPaste={(e) => {
                                // 粘贴时自动发送（如果内容较长）
                                const pastedText = e.clipboardData.getData('text');
                                if (pastedText.length > 50 && !input.trim()) {
                                    setTimeout(() => {
                                        setInput(pastedText);
                                        setTimeout(() => handleSend(pastedText), 100);
                                    }, 0);
                                }
                            }}
                            placeholder={selectedStyle ? `(${selectedStyle}) ${t.typeMessage}` : t.typeMessage} 
                            className="flex-1 bg-transparent border-none text-textMain placeholder-textSecondary focus:ring-0 resize-none py-3 max-h-32 px-2" 
                            autoComplete="off" 
                            disabled={isTyping}
                            rows={1}
                            style={{ minHeight: '44px', maxHeight: '128px' }}
                        />
                        {isTyping ? ( <button onClick={handleStopGeneration} className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all border border-red-500/20" title="Stop Generating"> <StopCircle size={20} /> </button> ) : ( <button onClick={() => {
                            console.log('🖱️ Send button clicked, activeSessionId:', activeSessionId, 'input:', input);
                            handleSend();
                        }} disabled={!input.trim()} className={`p-2 rounded-xl transition-all ${input.trim() ? 'bg-primary text-white hover:brightness-110 shadow-lg shadow-primary/20' : 'bg-background text-textSecondary'}`}> <Send size={20} /> </button> )}
                    </div>
                    {activeSession.isGroup && ( <div className="text-center mt-2"> <p className="text-[10px] text-textSecondary"> {t.usageTipPart1} <span className="font-mono bg-surface border border-border px-1 rounded text-textMain">@AgentName</span> {t.usageTipPart2} </p> </div> )}
                </div>
              </div>
          </div>

          {/* CONTEXT DRAWER */}
          {isDrawerOpen && (
              <div className="w-80 bg-surface border-l border-border flex flex-col shadow-2xl animate-slide-up origin-right h-full overflow-hidden absolute right-0 top-0 z-40">
                  <div className="p-4 border-b border-border bg-background/30 flex items-center justify-center">
                      <h3 className="font-bold text-textMain flex items-center gap-2"> <BookOpen size={16} className="text-primary" /> {t.contextPanel} </h3>
                      <button onClick={() => setIsDrawerOpen(false)} className="text-textSecondary hover:text-textMain p-1 rounded-lg hover:bg-background absolute right-4"> <X size={18} /> </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {activeProject ? ( <> <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary mb-2"> {t.drawerInfo} </div> <div className="space-y-3"> {Object.keys(localContextData).map(key => { if (key.startsWith('_content_') || key === 'documents' || key.startsWith('_successful_examples_')) return null; return ( <div key={key} className="space-y-1"> <label className="text-[10px] font-bold text-textSecondary uppercase block">{key.replace(/_/g, ' ')}</label> <input type="text" value={localContextData[key] as string || ''} onChange={(e) => setLocalContextData(prev => ({...prev, [key]: e.target.value}))} className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-textMain focus:border-primary outline-none" /> </div> ); })} </div> </> ) : ( <div className="text-center py-10 text-textSecondary italic text-xs"> {t.noActiveProject} </div> )}
                  </div>
                  {activeProject && ( <div className="p-4 border-t border-border bg-background/30"> <button onClick={handleSaveContext} className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:brightness-110 shadow-lg shadow-primary/20 transition-all"> <Save size={14} /> {t.saveContext} </button> </div> )}
              </div>
          )}

          {/* SIMULATOR DRAWER (NEW) */}
          {isSimulatorOpen && (
              <>
                <div 
                    className="absolute inset-0 bg-black/20 backdrop-blur-[2px] z-40 animate-fade-in"
                    onClick={() => setIsSimulatorOpen(false)}
                ></div>
                <div className="absolute right-0 top-0 h-full w-full md:w-[65%] lg:w-[900px] bg-background border-l border-border shadow-2xl z-50 animate-slide-in-right flex flex-col">
                    <button 
                        onClick={() => setIsSimulatorOpen(false)} 
                        className="absolute top-6 right-6 z-[60] p-2 bg-black/10 hover:bg-black/20 text-textMain rounded-full backdrop-blur-md transition-all"
                    >
                        <X size={20}/>
                    </button>
                    
                    <div className="flex-1 overflow-hidden relative">
                        <XiaohongshuSimulator 
                            language={language} 
                            user={user} 
                            initialData={simulatorData || getLastAiContent()}
                            compact={true} 
                            onUpdateProjectData={onUpdateProjectData} // Pass callback
                        />
                    </div>
                </div>
              </>
          )}
      </div>
    </div>
  );
};

export default Chat;
