import { GoogleGenAI, Type } from "@google/genai";
import { Agent, WorkflowNode, WorkflowEdge, UserProfileData } from "../types";
import { storage } from '../utils/storage';

// Helper to get client dynamically (strictly follows mandatory SDK initialization guidelines)
const getClient = () => {
  // 前端使用 import.meta.env，后端使用 process.env
  const apiKey = typeof window !== 'undefined' 
    ? import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY
    : process.env.GEMINI_API_KEY || process.env.API_KEY;
  
  // Explicitly check for API Key presence from environment variable only
  if (!apiKey) {
      console.warn("⚠️ Gemini API Key not found. Some features may not work.");
      // 不抛出错误，允许降级处理
      return null;
  }

  // Strictly follow: const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
  return new GoogleGenAI({ apiKey });
};

// Gets the System Default Model
const getDefaultModelName = () => {
    return storage.loadModelName();
};

// Robust JSON cleaning to handle markdown code blocks from AI
const cleanJsonString = (text: string): string => {
    if (!text) return '{}';
    // Remove ```json ... ``` or just ``` ... ```
    return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
};

// Define the structure of the intent response
export interface IntentAnalysis {
  type: 'general' | 'task';
  targetAgentId?: string;
  confidence: number;
  contextAnalysis: string[]; // Key points extracted for the task context
  directResponse?: string; // Optional: if it's general, we might get a short suggested response or just type
}

export interface OrchestrationResult {
    title: string;
    agentIds: string[];
    initialPlan: string;
}

export interface DouyinAnalysisResult {
    score: number;
    persona: string[];
    hooks: string[];
    strategy: string;
    script: string;
    keywords: string[];
}

// NEW: Content Audit Result
export interface ContentAuditResult {
    score: number; // 0-100
    grade: 'S' | 'A' | 'B' | 'C' | 'D';
    summary: string;
    suggestions: string[];
    viralFactors: string[]; // Positive points
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

export const generateAgentResponse = async (
  prompt: string,
  systemInstruction: string,
  onStream: (text: string) => void,
  modelOverride?: string, // Optional: Frontend selected model
  userPreferences?: string, // NEW: Global User Instructions / Long-term Memory
  contextExamples?: string[] // NEW: Few-Shot Examples from Knowledge Base
): Promise<string> => {
  try {
    const ai = getClient();
    if (!ai) {
      throw new Error("API key not configured. Please configure Gemini API key in settings.");
    }
    const model = modelOverride || getDefaultModelName();
    
    // Inject User Preferences into System Prompt
    let finalSystemInstruction = systemInstruction;
    
    // 1. Inject Global Preferences
    if (userPreferences && userPreferences.trim()) {
        finalSystemInstruction += `\n\n[GLOBAL USER MEMORY & PREFERENCES]:\n${userPreferences}\n\n(IMPORTANT: You MUST respect the above Global Preferences in your response.)`;
    }

    // 2. Inject Dynamic Few-Shot Examples (Living Context)
    if (contextExamples && contextExamples.length > 0) {
        finalSystemInstruction += `\n\n[SUCCESSFUL EXAMPLES / KNOWLEDGE BASE]:\nHere are past outputs that the user liked. Use them as a style reference (Few-Shot Learning):\n`;
        contextExamples.forEach((ex, i) => {
            finalSystemInstruction += `\n--- Example ${i + 1} ---\n${ex.substring(0, 500)}...\n`; // Truncate to save tokens
        });
    }

    const responseStream = await ai.models.generateContentStream({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: finalSystemInstruction,
      }
    });

    let fullText = '';
    for await (const chunk of responseStream) {
      const text = chunk.text || '';
      fullText += text;
      onStream(fullText);
    }
    return fullText;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    if (error.message === "MISSING_API_KEY") {
        const msg = "⚠️ **System Alert**: API Key is missing. Please ensure the API_KEY environment variable is configured.";
        onStream(msg);
        return msg;
    }

    // Handle Fetch/Network errors
    if (error.message && (error.message.includes('fetch') || error.message.includes('Network'))) {
        const msg = "⚠️ **Connection Failed**: Could not reach the API endpoint. Please check your internet connection.";
        onStream(msg);
        return msg;
    }

    const errorMsg = `⚠️ **API Error**: ${error.message || 'Unknown error'}. Please check your configuration (Model Name: ${modelOverride || getDefaultModelName()}).`;
    onStream(errorMsg);
    return errorMsg;
  }
};

export const classifyMessageIntent = async (
  userMessage: string,
  availableAgents: Agent[]
): Promise<IntentAnalysis> => {
  try {
    const ai = getClient();
    if (!ai) {
      // 如果没有 API key，返回默认值，允许继续
      console.warn("⚠️ No API key available, using default intent analysis");
      return { type: 'general', contextAnalysis: [], confidence: 0 };
    }
    // Intent classification usually works best with a fast/smart model. 
    // We stick to the default system model here to avoid user-selected model quirks (like reasoning models) breaking JSON structure.
    const model = getDefaultModelName();
    
    // Construct a list of specialized agents for the prompt
    const agentsList = availableAgents
      .filter(a => a.id !== 'a1') // Exclude the main orchestrator/assistant
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

    // Clean potential markdown before parsing
    const cleanedText = cleanJsonString(text);
    return JSON.parse(cleanedText) as IntentAnalysis;

  } catch (error: any) {
    console.error("Intent Analysis Error:", error);
    // Fallback to general if analysis fails, allows the chat to continue
    // 不显示错误给用户，静默降级
    return { type: 'general', contextAnalysis: [], confidence: 0 };
  }
};

// ... (Other functions: detectContextUpdate, generateFollowUpQuestions, analyzeDraft, predictContentPerformance, repurposeContent) ...
// NEW FUNCTION: Detect Context Updates (Passive Listener)
export const detectContextUpdate = async (
    userMessage: string,
    currentContext: UserProfileData,
    language: 'en' | 'zh'
): Promise<ContextUpdateSuggestion | null> => {
    try {
        // Skip detection for very short messages
        if (userMessage.length < 5) return null;

        const ai = getClient();
        if (!ai) {
            // 如果没有 API key，返回 null（静默失败）
            return null;
        }
        const model = 'gemini-3-flash-preview'; // Fast model for background check

        // Filter out internal keys
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
        
        // Basic validation: ensure key actually exists in context
        if (result && result.key && currentContext[result.key] !== undefined) {
            return result;
        }
        return null;

    } catch (e) {
        console.error("Context update detection failed", e);
        return null;
    }
};

export const generateFollowUpQuestions = async (
    lastUserMessage: string,
    lastAiResponse: string,
    language: 'en' | 'zh'
): Promise<string[]> => {
    try {
        const ai = getClient();
        if (!ai) {
            // 如果没有 API key，返回空数组
            return [];
        }
        const model = 'gemini-3-flash-preview'; // Use a fast model for this

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

export const predictContentPerformance = async (
    platform: 'rednote' | 'tiktok' | 'linkedin',
    title: string,
    content: string,
    language: 'en' | 'zh'
): Promise<ContentAuditResult | null> => {
    try {
        const ai = getClient();
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

export const repurposeContent = async (
    sourceContent: string,
    targetPlatform: 'rednote' | 'tiktok' | 'linkedin',
    language: 'en' | 'zh'
): Promise<{ title: string, content: string }> => {
    try {
        const ai = getClient();
        const model = 'gemini-3-flash-preview';

        const prompt = `
            You are a Cross-Platform Content Expert.
            Adapt the following content for ${targetPlatform}.
            
            Source Content: "${sourceContent.substring(0, 2000)}"
            Target Language: ${language === 'zh' ? 'Chinese' : 'English'}

            Guidelines for ${targetPlatform}:
            ${targetPlatform === 'rednote' ? '- Use emojis, tags, aesthetic tone. Structure with bullet points.' : ''}
            ${targetPlatform === 'tiktok' ? '- Convert to a Video Script format. Include [Visual] and [Audio] cues. Hook in first 3 seconds.' : ''}
            ${targetPlatform === 'linkedin' ? '- Professional tone, storytelling approach, "broetry" line spacing, hashtags at bottom.' : ''}

            Output strictly as valid JSON:
            {
                "title": "Adapted Title",
                "content": "Adapted Body/Script"
            }
        `;

        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });

        const text = response.text;
        if (!text) return { title: '', content: '' };
        return JSON.parse(cleanJsonString(text));
    } catch (e) {
        console.error("Repurpose content failed", e);
        return { title: '', content: '' };
    }
};

export const analyzeDraft = async (
    title: string,
    content: string,
    language: 'en' | 'zh'
): Promise<DraftAnalysisResult | null> => {
    try {
        const ai = getClient();
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

export const generateSystemPrompt = async (
    description: string,
    language: 'en' | 'zh'
): Promise<string> => {
    try {
        const ai = getClient();
        const model = 'gemini-3-flash-preview'; // Use a fast, efficient model
        
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

export const generateWorkflow = async (
    description: string,
    language: 'en' | 'zh'
): Promise<{ nodes: WorkflowNode[], edges: WorkflowEdge[] } | null> => {
    try {
        const ai = getClient();
        const model = 'gemini-3-flash-preview'; // Fast and capable enough for JSON structure

        const prompt = `
            You are an AI Workflow Architect. Your goal is to design a "Workflow" based on the user's description.
            
            User Description: "${description}"
            Target Language: ${language === 'zh' ? 'Chinese (Simplified)' : 'English'}

            Available Node Types:
            - start: The entry point.
            - end: The final response.
            - llm: A generic LLM call. Use this for EXTRACTION, ANALYSIS, or SUMMARIZATION.
            - agent: A specific specialized agent (Use 'a2' for Copywriting, 'a3' for Coding, 'a4' for Data, 'a5' for Legal).
            - classifier: Classifies input into intents (e.g. Sales, Support, Tech).
            - condition: Logic check (e.g. if variable == value).
            - retrieval: RAG search.
            - user_profile: Loads user context.

            CRITICAL LOGIC FOR "EXTRACTION" or "DETECTION" REQUESTS:
            If the user asks to "detect", "analyze", "extract" specific fields (like Age, Habits, Purpose) from text:
            1. Create an 'llm' node immediately after start.
            2. Set its systemPrompt to: "Analyze the input and extract the following fields: [List fields here]. Return as JSON."
            3. Then, use a 'condition' node or 'agent' node to use that extracted data.

            Output Rules:
            1. Return a valid JSON object with "nodes" and "edges".
            2. Nodes must have unique IDs, "type", "position" ({x, y}), and "data" ({label, description, systemPrompt...}).
            3. VISUAL LAYOUT: Position nodes Left to Right (Start at x:100). Increase X by ~300 for each step.
            
            Example JSON Structure:
            {
              "nodes": [
                { "id": "start-1", "type": "start", "position": { "x": 100, "y": 300 }, "data": { "label": "Start" } },
                { "id": "llm-1", "type": "llm", "position": { "x": 400, "y": 300 }, "data": { "label": "Analyze & Extract", "systemPrompt": "Extract age, goal, and habits from {{input}} as JSON." } },
                { "id": "agent-1", "type": "agent", "position": { "x": 700, "y": 300 }, "data": { "label": "Generate Copy", "agentId": "a2", "systemPrompt": "Use the extracted data {{context.last_output}} to write copy." } },
                { "id": "end-1", "type": "end", "position": { "x": 1000, "y": 300 }, "data": { "label": "End" } }
              ],
              "edges": [
                { "id": "e1", "source": "start-1", "target": "llm-1" },
                { "id": "e2", "source": "llm-1", "target": "agent-1" },
                { "id": "e3", "source": "agent-1", "target": "end-1" }
              ]
            }
            
            IMPORTANT: Return ONLY the raw JSON string. Do not wrap in markdown code blocks.
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
        return JSON.parse(cleanJsonString(text));
    } catch (e) {
        console.error("Workflow generation error", e);
        return null;
    }
};

export const orchestrateGoal = async (
    goal: string,
    availableAgents: Agent[],
    language: 'en' | 'zh'
): Promise<OrchestrationResult | null> => {
    try {
        const ai = getClient();
        if (!ai) {
            console.warn("⚠️ No API key available for orchestration");
            // 返回一个默认的编排结果，允许用户继续
            return {
                title: goal.substring(0, 50),
                agentIds: availableAgents.filter(a => a.id !== 'a1').slice(0, 2).map(a => a.id),
                initialPlan: language === 'zh' 
                    ? `我们将使用可用的智能体来帮助您实现目标：${goal}`
                    : `We will use available agents to help you achieve: ${goal}`
            };
        }
        const model = 'gemini-3-pro-preview'; // Smart model needed for planning

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

export const analyzeDouyinAccount = async (
    link: string,
    manualContext: string,
    language: 'en' | 'zh'
): Promise<DouyinAnalysisResult | null> => {
    try {
        const ai = getClient();
        // Use Gemini 3 Flash Preview as it supports Google Search Tool
        const model = 'gemini-3-flash-preview'; 

        const inputSection = link 
            ? `Target Link: ${link}\n(Use Google Search to find details about this link/account)` 
            : `(No link provided)`;
        
        const contextSection = manualContext
            ? `Additional Context from User: ${manualContext}`
            : ``;

        const prompt = `
            You are a top-tier "Douyin (TikTok) Content Strategist". Your job is to analyze the provided account information and reverse-engineer their viral success formula.

            ${inputSection}
            ${contextSection}

            Target Language: ${language === 'zh' ? 'Chinese (Simplified)' : 'English'}

            Instruction:
            1. If a link is provided, use the 'googleSearch' tool to find information about this Douyin/TikTok account or video title. Look for video captions, account bio, and engagement style.
            2. If specific video details cannot be found via search, infer the likely content strategy based on the Account Name or User Context provided.
            3. Analyze the content to determine a "Viral Score" (0-100).
            4. Identify the core "Persona" (Target Audience).
            5. Deconstruct the "Golden Hooks" (What likely happens in the first 3 seconds).
            6. Summarize the "Content Strategy".
            7. Write a "Replication Script" for a new video in this style.
            8. Extract high-traffic "Keywords".

            IMPORTANT: Output the result strictly as a valid JSON object. Do not include markdown formatting like \`\`\`json.
            
            JSON Schema:
            {
                "score": number,
                "persona": ["tag1", "tag2", "tag3"],
                "hooks": ["point 1", "point 2"],
                "strategy": "string (summary)",
                "script": "string (actual short video script)",
                "keywords": ["#tag1", "#tag2"]
            }
        `;

        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                // When using googleSearch, we generally cannot enforce responseMimeType: 'application/json' 
                // reliably because the model inserts citations. 
                // We will parse the text output manually using cleanJsonString.
                tools: [{ googleSearch: {} }] 
            }
        });

        const text = response.text;
        if (!text) return null;
        
        // Debug: Log search results if available (optional)
        // console.log(response.candidates?.[0]?.groundingMetadata?.groundingChunks);

        return JSON.parse(cleanJsonString(text));
    } catch (e) {
        console.error("Douyin analysis error", e);
        return null;
    }
};

export const generateImage = async (prompt: string): Promise<string | null> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: { aspectRatio: '3:4' }
      }
    });

    // Iterate to find the inline data
    for (const part of response.candidates?.[0]?.content?.parts || []) {
       if (part.inlineData) {
         return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
       }
    }
    return null;
  } catch (e) {
    console.error("Image generation failed", e);
    return null;
  }
};