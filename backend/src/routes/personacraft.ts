import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { getActiveApiConfig } from '../services/apiService.js';

const router = express.Router();

/**
 * 使用系统配置的 API 生成完整响应（非流式）
 */
async function generateCompleteResponse(
  prompt: string,
  systemInstruction: string,
  modelOverride?: string
): Promise<string> {
  const apiConfig = await getActiveApiConfig();
  
  if (!apiConfig) {
    throw new Error("No API configuration found. Please configure an API in the admin settings.");
  }

  // 选择模型
  const model = modelOverride || apiConfig.modelMapping?.['default'] || 'deepseek-chat';
  console.log(`📝 PersonaCraft using model: ${model} from ${apiConfig.provider}`);

  // 构建请求
  const requestConfig = apiConfig.requestConfig || {};
  const authHeader = requestConfig.authHeaderFormat 
    ? requestConfig.authHeaderFormat.replace('{apiKey}', apiConfig.apiKey)
    : `Bearer ${apiConfig.apiKey}`;

  const url = `${apiConfig.baseUrl}/v1/chat/completions`;
  
  const requestBody = {
    model: model,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    stream: false, // 非流式
    temperature: 0.7,
    max_tokens: 8000, // PersonaCraft 需要更长的输出
    response_format: { type: 'json_object' } // 强制 JSON 格式
  };

  console.log(`📡 PersonaCraft calling ${apiConfig.provider} API: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      ...(requestConfig.headers || {}),
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ PersonaCraft API request failed: ${response.status}`, errorText);
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
  
  if (!content) {
    throw new Error('No content in API response');
  }

  return content;
}


// 生成初始优化
router.post('/generate', authenticate, async (req: AuthRequest, res) => {
  try {
    const { rawKnowledge } = req.body;

    if (!rawKnowledge || typeof rawKnowledge !== 'string' || !rawKnowledge.trim()) {
      return res.status(400).json({ error: 'rawKnowledge is required' });
    }

    const systemInstruction = `你是一位高级 AI 知识库架构师。你的核心任务是**整理**和**结构化**用户提供的原始知识库内容，而不是**摘要**或**缩写**它。

请执行以下操作：
1. **创建系统提示词 (System Prompt)**：为智能体设计一个详细的 System Prompt。**特别注意：此系统提示词必须完全使用简体中文撰写**。它应指导智能体如何利用下方的知识库。
2. **优化知识库 (Optimized Knowledge)**：对原始知识库进行 Markdown 格式化和逻辑分层。**内容必须是简体中文**。

**【至关重要的约束 - 请务必遵守】**
- **语言强制**：输出 JSON 中的 \`systemPrompt\` 和 \`optimizedKnowledge\` 字段内容必须**强制使用简体中文**。即使原始文本包含英文，也请在生成的人设和知识库中将其转化为中文（除非是专有名词）。
- **严禁过度摘要 (NO SUMMARIZATION)**：用户强烈要求保留原始素材的丰富度和细节。请**完整保留**原始数据中的案例、具体参数、对话细节和解释。
- **保留体量**：如果用户输入了 10 万字，请尽量输出接近 10 万字的结构化内容（受限于输出长度限制，请优先保留核心章节的全部细节，而不是对全文做草率的概括）。
- **拒绝"省流"模式**：不要为了节省 Token 而删减内容。你的目标是让内容更有条理（加标题、列表、引用块），而不是让内容变少。
- **结构化重写**：将大段文本拆分为清晰的章节（# 标题）、子章节（## 标题）和要点列表。

请严格以 JSON 格式返回输出，格式如下：
{
  "systemPrompt": "系统提示词内容（简体中文）",
  "optimizedKnowledge": "优化后的知识库内容（简体中文）"
}`;

    const prompt = `原始知识库内容：
"""
${rawKnowledge}
"""

请根据上述原始知识库内容，生成系统提示词和优化后的知识库。`;

    const responseText = await generateCompleteResponse(prompt, systemInstruction);
    
    // 清理 JSON 字符串
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const result = JSON.parse(cleanedText);

    res.json({
      systemPrompt: result.systemPrompt || '',
      optimizedKnowledge: result.optimizedKnowledge || ''
    });
  } catch (error: any) {
    console.error('PersonaCraft generate error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate optimization' });
  }
});

// 精炼内容
router.post('/refine', authenticate, async (req: AuthRequest, res) => {
  try {
    const { currentPrompt, currentKnowledge, instruction, history } = req.body;

    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return res.status(400).json({ error: 'instruction is required' });
    }

    const systemInstruction = `你是一个集成在"AI 人设与知识库优化工具"中的智能助手。

当前上下文：
1. **当前系统提示词**：用户智能体的提示词草稿。
2. **当前知识库**：知识库草稿（可能非常长）。

**核心原则**：
- **语言强制**：无论用户指令是什么语言，生成的 \`systemPrompt\`、\`optimizedKnowledge\` 和 \`chatResponse\` 必须**强制使用简体中文**。
- 在修改知识库时，**严禁**无故删除细节。除非用户明确要求"精简"，否则默认操作是"扩充"或"重组"。
- 保持信息的最高密度。

**重要优化策略**：
- 如果用户**仅询问问题**（如"为什么要这样设计？"），请将 \`systemPrompt\` 和 \`optimizedKnowledge\` 字段设为 \`null\`，只返回 \`chatResponse\`。
- 如果用户要求**修改提示词**但**不修改知识库**，请只返回新的 \`systemPrompt\`，将 \`optimizedKnowledge\` 设为 \`null\`。
- 如果用户要求**修改知识库**，请返回新的 \`optimizedKnowledge\`。请注意，你必须返回**完整**的知识库内容，而不仅仅是修改的部分。如果知识库很长，这会消耗较多时间，请只在必要时修改。

请严格以 JSON 格式返回输出，格式如下：
{
  "systemPrompt": "更新后的系统指令（简体中文）。如果未更改，请返回 null。",
  "optimizedKnowledge": "更新后的完整知识库（简体中文）。如果未更改，请返回 null。",
  "chatResponse": "给用户的对话回复（简体中文）。"
}`;

    const prompt = `[当前系统提示词 开始]
${currentPrompt || ''}
[当前系统提示词 结束]

[当前优化后的知识库 开始]
${currentKnowledge || ''}
[当前优化后的知识库 结束]

用户指令: ${instruction}`;

    const responseText = await generateCompleteResponse(prompt, systemInstruction);
    
    // 清理 JSON 字符串
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const result = JSON.parse(cleanedText);

    res.json({
      systemPrompt: result.systemPrompt || null,
      optimizedKnowledge: result.optimizedKnowledge || null,
      chatResponse: result.chatResponse || '已根据您的要求更新内容。'
    });
  } catch (error: any) {
    console.error('PersonaCraft refine error:', error);
    res.status(500).json({ error: error.message || 'Failed to refine content' });
  }
});

export default router;


