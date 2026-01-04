import { GoogleGenAI } from "@google/genai";

// 类型定义（简化版，避免跨项目导入）
export interface Agent {
  id: string;
  name: string;
  role?: string;
  description: string;
  category: string;
}

export interface UserProfileData {
  [key: string]: any;
}

// 获取 Gemini 客户端
const getClient = async () => {
  // 1. 优先从数据库配置获取
  try {
    const { query } = await import('../db/connection.js');
    const result = await query(
      "SELECT value FROM system_settings WHERE key = 'gemini_api_key'"
    );
    
    if (result.rows.length > 0 && result.rows[0].value) {
      const apiKey = typeof result.rows[0].value === 'string' 
        ? JSON.parse(result.rows[0].value) 
        : result.rows[0].value;
      
      if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
        return new GoogleGenAI({ apiKey: apiKey.trim() });
      }
    }
  } catch (error) {
    console.warn('Failed to get Gemini API key from database:', error);
  }

  // 2. Fallback 到环境变量
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    return new GoogleGenAI({ apiKey });
  }

  throw new Error("GEMINI_API_KEY not configured. Please configure it in admin settings.");
};

// 清理 JSON 字符串（移除 markdown 代码块）
const cleanJsonString = (text: string): string => {
  if (!text) return '{}';
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
};

// 导出所有前端需要的函数
export interface IntentAnalysis {
  type: 'general' | 'task';
  targetAgentId?: string;
  confidence: number;
  contextAnalysis: string[];
  directResponse?: string;
}

export interface OrchestrationResult {
  title: string;
  agentIds: string[];
  initialPlan: string;
}

export interface ContextUpdateSuggestion {
  key: string;
  oldValue: string;
  newValue: string;
  reason?: string;
}

export interface DraftAnalysisResult {
  score: number;
  titleGrade: 'S' | 'A' | 'B' | 'C' | 'D';
  contentGrade: 'S' | 'A' | 'B' | 'C' | 'D';
  suggestions: string[];
}

export interface ContentAuditResult {
  score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  summary: string;
  suggestions: string[];
  viralFactors: string[];
}

// 生成 Agent 响应（流式）
export const generateAgentResponse = async (
  prompt: string,
  systemInstruction: string,
  modelOverride?: string,
  userPreferences?: string,
  contextExamples?: string[]
): Promise<{ text: string; tokens?: { input: number; output: number } }> => {
  try {
    const ai = await getClient();
    const model = modelOverride || 'gemini-3-flash-preview';
    
    let finalSystemInstruction = systemInstruction;
    
    if (userPreferences && userPreferences.trim()) {
      finalSystemInstruction += `\n\n[GLOBAL USER MEMORY & PREFERENCES]:\n${userPreferences}\n\n(IMPORTANT: You MUST respect the above Global Preferences in your response.)`;
    }

    if (contextExamples && contextExamples.length > 0) {
      finalSystemInstruction += `\n\n[SUCCESSFUL EXAMPLES / KNOWLEDGE BASE]:\nHere are past outputs that the user liked. Use them as a style reference (Few-Shot Learning):\n`;
      contextExamples.forEach((ex, i) => {
        finalSystemInstruction += `\n--- Example ${i + 1} ---\n${ex.substring(0, 500)}...\n`;
      });
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: finalSystemInstruction,
      }
    });

    const text = response.text || '';
    return { text };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || 'Gemini API request failed');
  }
};

// 生成 Agent 响应（流式）
export const generateAgentResponseStream = async function* (
  prompt: string,
  systemInstruction: string,
  modelOverride?: string,
  userPreferences?: string,
  contextExamples?: string[]
): AsyncGenerator<string, void, unknown> {
  try {
    const ai = await getClient();
    const model = modelOverride || 'gemini-3-flash-preview';
    
    let finalSystemInstruction = systemInstruction;
    
    if (userPreferences && userPreferences.trim()) {
      finalSystemInstruction += `\n\n[GLOBAL USER MEMORY & PREFERENCES]:\n${userPreferences}\n\n(IMPORTANT: You MUST respect the above Global Preferences in your response.)`;
    }

    if (contextExamples && contextExamples.length > 0) {
      finalSystemInstruction += `\n\n[SUCCESSFUL EXAMPLES / KNOWLEDGE BASE]:\nHere are past outputs that the user liked. Use them as a style reference (Few-Shot Learning):\n`;
      contextExamples.forEach((ex, i) => {
        finalSystemInstruction += `\n--- Example ${i + 1} ---\n${ex.substring(0, 500)}...\n`;
      });
    }

    const responseStream = await ai.models.generateContentStream({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: finalSystemInstruction,
      }
    });

    for await (const chunk of responseStream) {
      const text = chunk.text || '';
      if (text) {
        yield text;
      }
    }
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    yield `⚠️ **API Error**: ${error.message || 'Unknown error'}`;
  }
};

// 分类消息意图
export const classifyMessageIntent = async (
  userMessage: string,
  availableAgents: Agent[]
): Promise<IntentAnalysis> => {
  try {
    const ai = await getClient();
    const model = 'gemini-3-flash-preview';
    
    const agentsList = availableAgents
      .filter(a => a.id !== 'a1')
      .map(a => `- Name: ${a.name} (ID: ${a.id}). Expertise: ${a.description} Category: ${a.category}`)
      .join('\n');

    const prompt = `
      You are the "Brain" of an AI Agent Orchestration system. Your job is to analyze the User's Message and decide if it is a "General" conversation or a "Task" that requires a specific Specialist Agent.

      Available Specialist Agents:
      ${agentsList}

      Rules:
      1. If the user says "Hello", "Hi", "Who are you?", "Thank you", or asks general knowledge questions, classify as "general".
      2. If the user explicitly asks to CREATE something, WRITE code, DRAFT a contract, ANALYZE data, or mentions a specific domain task, classify as "task".
      3. If classified as "task", identify the best matching Agent ID from the list.
      4. Extract 2-3 short bullet points of "context" or "requirements" from the user message (e.g., "Language: Python", "Tone: Professional").

      Output must be valid JSON matching this schema:
      {
        "type": "general" | "task",
        "targetAgentId": "string (optional, only if task)",
        "contextAnalysis": ["string", "string"]
      }
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: userMessage,
      config: {
        systemInstruction: prompt,
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from intent classifier");

    const cleanedText = cleanJsonString(text);
    return JSON.parse(cleanedText) as IntentAnalysis;
  } catch (error) {
    console.error("Intent Analysis Error:", error);
    return { type: 'general', contextAnalysis: [], confidence: 0 };
  }
};

// 检测上下文更新
export const detectContextUpdate = async (
  userMessage: string,
  currentContext: UserProfileData,
  language: 'en' | 'zh'
): Promise<ContextUpdateSuggestion | null> => {
  try {
    if (userMessage.length < 5) return null;

    const ai = await getClient();
    const model = 'gemini-3-flash-preview';

    const cleanContext: Record<string, string> = {};
    Object.entries(currentContext).forEach(([k, v]) => {
      if (!k.startsWith('_') && typeof v === 'string') {
        cleanContext[k] = v;
      }
    });

    if (Object.keys(cleanContext).length === 0) return null;

    const prompt = `
      You are a "Context Manager" AI. Your job is to listen to the user's message and detect if they are updating a specific fact in their Project Context.

      Current Context:
      ${JSON.stringify(cleanContext, null, 2)}

      User Message: "${userMessage}"

      Target Language: ${language === 'zh' ? 'Chinese' : 'English'}

      Task:
      1. Does the user explicitly state a CHANGE to one of the existing keys above? (e.g. "Change the deadline to...", "The product name is actually...")
      2. If YES, extract the Key, Old Value, and New Value.
      3. If NO, return null.

      Output strictly as valid JSON or null:
      {
        "key": "existing_variable_key",
        "oldValue": "string",
        "newValue": "string",
        "reason": "Short explanation"
      }
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
    if (!text) return null;
    
    const result = JSON.parse(cleanJsonString(text));
    
    if (result && result.key && currentContext[result.key] !== undefined) {
      return result;
    }
    return null;
  } catch (e) {
    console.error("Context update detection failed", e);
    return null;
  }
};

// 生成后续问题
export const generateFollowUpQuestions = async (
  lastUserMessage: string,
  lastAiResponse: string,
  language: 'en' | 'zh'
): Promise<string[]> => {
  try {
    const ai = await getClient();
    const model = 'gemini-3-flash-preview';

    const prompt = `
      Based on the following conversation, generate 3 short, relevant follow-up questions that the user might want to ask next.
      Keep them concise (under 10 words).
      Respond in JSON format: ["question 1", "question 2", "question 3"].
      
      Conversation:
      User: ${lastUserMessage.substring(0, 500)}
      AI: ${lastAiResponse.substring(0, 500)}
      
      Language: ${language === 'zh' ? 'Chinese (Simplified)' : 'English'}
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(cleanJsonString(text));
  } catch (e) {
    console.error("Follow-up gen error", e);
    return [];
  }
};

// 分析草稿
export const analyzeDraft = async (
  title: string,
  content: string,
  language: 'en' | 'zh'
): Promise<DraftAnalysisResult | null> => {
  try {
    const ai = await getClient();
    const model = 'gemini-3-flash-preview';

    const prompt = `
      Act as a Xiaohongshu (Little Red Book) Algorithm Expert and Content Strategist.
      Analyze the following draft post for viral potential.

      Title: "${title}"
      Content: "${content}"

      Target Language: ${language === 'zh' ? 'Chinese (Simplified)' : 'English'}

      Evaluation Criteria:
      1. Title CTR: Curiosity gap, emotional hooks, keywords, clarity.
      2. Content Engagement: Structure, readability, value provided, calls to action (likes/comments).
      3. Keywords: Presence of trending tags/keywords.

      Output strictly as valid JSON:
      {
        "score": number (0-100),
        "titleGrade": "S" | "A" | "B" | "C" | "D",
        "contentGrade": "S" | "A" | "B" | "C" | "D",
        "suggestions": ["specific actionable advice 1", "advice 2", "advice 3"]
      }
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(cleanJsonString(text));
  } catch (e) {
    console.error("Draft analysis failed", e);
    return null;
  }
};

// 预测内容表现
export const predictContentPerformance = async (
  platform: 'rednote' | 'tiktok' | 'linkedin',
  title: string,
  content: string,
  language: 'en' | 'zh'
): Promise<ContentAuditResult | null> => {
  try {
    const ai = await getClient();
    const model = 'gemini-3-flash-preview';

    const platformName = {
      'rednote': 'Xiaohongshu (Little Red Book)',
      'tiktok': 'TikTok / Douyin',
      'linkedin': 'LinkedIn'
    }[platform];

    const prompt = `
      Act as a Senior Content Strategist & Algorithm Expert for ${platformName}.
      Audit the following draft content for viral potential and algorithm fit.

      Draft Title: "${title}"
      Draft Content: "${content}"
      Language: ${language === 'zh' ? 'Chinese' : 'English'}

      Task:
      1. Assign a Score (0-100) based on CTR, Engagement potential, and Platform fit.
      2. Assign a Grade (S, A, B, C, D).
      3. Identify 2-3 "Viral Factors" (What makes it good?).
      4. Provide 3 specific, actionable "Improvement Suggestions" (e.g., "Change title to include a number", "Add a Call to Action").

      Output strictly as valid JSON:
      {
        "score": 85,
        "grade": "A",
        "summary": "Short analysis summary...",
        "viralFactors": ["factor 1", "factor 2"],
        "suggestions": ["advice 1", "advice 2", "advice 3"]
      }
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(cleanJsonString(text));
  } catch (e) {
    console.error("Predict performance failed", e);
    return null;
  }
};

// 编排目标
export const orchestrateGoal = async (
  goal: string,
  availableAgents: Agent[],
  language: 'en' | 'zh'
): Promise<OrchestrationResult | null> => {
  try {
    const ai = await getClient();
    const model = 'gemini-3-pro-preview';

    const agentsList = availableAgents
      .filter(a => a.id !== 'a1')
      .map(a => `- Name: ${a.name} (ID: ${a.id}). Role: ${a.role}. Expertise: ${a.description}`)
      .join('\n');

    const prompt = `
      You are an Expert Project Manager AI. The user has a high-level goal.
      Your job is to:
      1. Analyze the goal.
      2. Select the best 2-4 agents from the list below to form a "Squad" to achieve this goal.
      3. Create a concise "Initial Execution Plan" outlining what each selected agent will do.
      4. Generate a short, action-oriented title for this project.

      User Goal: "${goal}"
      Target Language: ${language === 'zh' ? 'Chinese (Simplified)' : 'English'}

      Available Agents:
      ${agentsList}

      Output strictly as valid JSON:
      {
        "title": "string (Project Title)",
        "agentIds": ["string", "string"],
        "initialPlan": "string (Markdown formatted plan, addressing the user directly, e.g. 'Here is the plan to achieve your goal...')"
      }
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return null;
    
    return JSON.parse(cleanJsonString(text)) as OrchestrationResult;
  } catch (e) {
    console.error("Orchestration error", e);
    return null;
  }
};

// 导出其他函数（简化版，需要时再实现）
export const generateSystemPrompt = async (description: string, language: 'en' | 'zh'): Promise<string> => {
  try {
    const ai = await getClient();
    const model = 'gemini-3-flash-preview';
    
    const metaPrompt = `
      You are an AI Prompt Engineering Expert. Your goal is to create a high-quality, professional "System Instruction" (System Prompt) for a new AI Agent based on the user's brief description.
      
      User's Brief Description: "${description}"
      Target Language: ${language === 'zh' ? 'Chinese (Simplified)' : 'English'}
      
      Instructions:
      1. Define a clear Identity/Persona.
      2. List specific Skills and Capabilities.
      3. Define the Tone and Style (e.g., professional, witty, strict).
      4. Add constraints (what NOT to do).
      5. The output must be the raw system prompt text, ready to be pasted into the agent configuration. Do not wrap in markdown code blocks unless necessary for the prompt content itself.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: metaPrompt
    });

    return response.text || '';
  } catch (e) {
    console.error("Prompt generation failed", e);
    return "";
  }
};

