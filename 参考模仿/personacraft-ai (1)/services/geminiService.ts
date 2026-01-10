import { GoogleGenAI, Type } from "@google/genai";
import { GeminiJsonResponse } from "../types";

// Switch to Pro model for better handling of complex/large text instructions
const MODEL_NAME = 'gemini-3-pro-preview';

function getClient() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found");
    return new GoogleGenAI({ apiKey });
}

function cleanJsonString(text: string): string {
    if (!text) return "{}";
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(json)?/, '').replace(/```$/, '');
    }
    return cleaned.trim();
}

/**
 * Initial generation: Takes raw knowledge and produces structured prompt & knowledge.
 */
export const generateInitialOptimization = async (rawText: string): Promise<GeminiJsonResponse> => {
  const ai = getClient();

  const prompt = `
    你是一位高级 AI 知识库架构师。用户提供了一份可能非常庞大的【原始知识库】。
    
    你的核心任务是**整理**和**结构化**这些内容，而不是**摘要**或**缩写**它。
    
    请执行以下操作：
    1. **创建系统提示词 (System Prompt)**：为智能体设计一个详细的 System Prompt。**特别注意：此系统提示词必须完全使用简体中文撰写**。它应指导智能体如何利用下方的知识库。
    2. **优化知识库 (Optimized Knowledge)**：对原始知识库进行 Markdown 格式化和逻辑分层。**内容必须是简体中文**。

    **【至关重要的约束 - 请务必遵守】**
    - **语言强制**：输出 JSON 中的 \`systemPrompt\` 和 \`optimizedKnowledge\` 字段内容必须**强制使用简体中文**。即使原始文本包含英文，也请在生成的人设和知识库中将其转化为中文（除非是专有名词）。
    - **严禁过度摘要 (NO SUMMARIZATION)**：用户强烈要求保留原始素材的丰富度和细节。请**完整保留**原始数据中的案例、具体参数、对话细节和解释。
    - **保留体量**：如果用户输入了 10 万字，请尽量输出接近 10 万字的结构化内容（受限于输出长度限制，请优先保留核心章节的全部细节，而不是对全文做草率的概括）。
    - **拒绝“省流”模式**：不要为了节省 Token 而删减内容。你的目标是让内容更有条理（加标题、列表、引用块），而不是让内容变少。
    - **结构化重写**：将大段文本拆分为清晰的章节（# 标题）、子章节（## 标题）和要点列表。

    原始知识库内容：
    """
    ${rawText}
    """

    请严格以 JSON 格式返回输出。
  `;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      // Use thinking capability to plan how to structure massive text without losing detail
      thinkingConfig: { thinkingBudget: 2048 }, 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          systemPrompt: { type: Type.STRING, description: "为 AI 智能体优化的详细系统指令（简体中文）。" },
          optimizedKnowledge: { type: Type.STRING, description: "结构化、分层级且保留了绝大部分原始细节的知识库内容（简体中文）。" }
        },
        required: ["systemPrompt", "optimizedKnowledge"]
      }
    }
  });

  const resultText = response.text;
  if (!resultText) throw new Error("No response from Gemini");

  return JSON.parse(cleanJsonString(resultText)) as GeminiJsonResponse;
};

/**
 * Refinement: Takes current state + user chat instruction and returns updated state.
 */
export const refineContent = async (
  currentPrompt: string,
  currentKnowledge: string,
  userInstruction: string,
  history: { role: string; content: string }[] = []
): Promise<GeminiJsonResponse> => {
  const ai = getClient();

  const systemInstruction = `
    你是一个集成在“AI 人设与知识库优化工具”中的智能助手。
    
    当前上下文：
    1. **当前系统提示词**：用户智能体的提示词草稿。
    2. **当前知识库**：知识库草稿（可能非常长）。

    **核心原则**：
    - **语言强制**：无论用户指令是什么语言，生成的 \`systemPrompt\`、\`optimizedKnowledge\` 和 \`chatResponse\` 必须**强制使用简体中文**。
    - 在修改知识库时，**严禁**无故删除细节。除非用户明确要求“精简”，否则默认操作是“扩充”或“重组”。
    - 保持信息的最高密度。

    **重要优化策略**：
    - 如果用户**仅询问问题**（如“为什么要这样设计？”），请将 \`systemPrompt\` 和 \`optimizedKnowledge\` 字段设为 \`null\`，只返回 \`chatResponse\`。
    - 如果用户要求**修改提示词**但**不修改知识库**，请只返回新的 \`systemPrompt\`，将 \`optimizedKnowledge\` 设为 \`null\`。
    - 如果用户要求**修改知识库**，请返回新的 \`optimizedKnowledge\`。请注意，你必须返回**完整**的知识库内容，而不仅仅是修改的部分。如果知识库很长，这会消耗较多时间，请只在必要时修改。

    你的协议：
    - 分析用户的请求。
    - 始终返回 JSON。
  `;

  // Construct a prompt that includes the current state as context
  const contentMessage = `
    [当前系统提示词 开始]
    ${currentPrompt}
    [当前系统提示词 结束]

    [当前优化后的知识库 开始]
    ${currentKnowledge}
    [当前优化后的知识库 结束]

    用户指令: ${userInstruction}
  `;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: contentMessage,
    config: {
      thinkingConfig: { thinkingBudget: 1024 },
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          systemPrompt: { type: Type.STRING, description: "更新后的系统指令（简体中文）。如果未更改，请返回 null。", nullable: true },
          optimizedKnowledge: { type: Type.STRING, description: "更新后的完整知识库（简体中文）。如果未更改，请返回 null。", nullable: true },
          chatResponse: { type: Type.STRING, description: "给用户的对话回复（简体中文）。" }
        },
        required: ["chatResponse"]
      }
    }
  });

  const resultText = response.text;
  if (!resultText) throw new Error("No response from Gemini");

  return JSON.parse(cleanJsonString(resultText)) as GeminiJsonResponse;
};
