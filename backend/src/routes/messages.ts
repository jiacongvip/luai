import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  generateAgentResponseStream,
  classifyMessageIntent,
  generateFollowUpQuestions,
  detectContextUpdate,
} from '../services/geminiService.js';
import { generateChatStream, getActiveApiConfig } from '../services/apiService.js';

const router = express.Router();

// ============================================
// 知识库检索功能（RAG）
// ============================================

/**
 * 生成文本的嵌入向量
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const apiConfig = await getActiveApiConfig();
    if (!apiConfig) {
      console.warn('⚠️ No API config found for embedding');
      return null;
    }

    // 构建 embedding 请求 URL
    let embeddingUrl = apiConfig.baseUrl;
    if (!embeddingUrl.endsWith('/v1/embeddings')) {
      embeddingUrl = embeddingUrl.replace(/\/v1\/chat\/completions\/?$/, '/v1/embeddings');
      if (!embeddingUrl.endsWith('/v1/embeddings')) {
        embeddingUrl = embeddingUrl.replace(/\/?$/, '/v1/embeddings');
      }
    }

    // 选择 embedding 模型
    const embeddingModel = apiConfig.modelMapping?.['embedding'] || 'text-embedding-3-small';

    const response = await fetch(embeddingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: text,
      }),
    });

    if (!response.ok) {
      console.warn(`⚠️ Embedding API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (error: any) {
    console.warn('⚠️ Embedding generation failed:', error.message);
    return null;
  }
}

/**
 * 从知识库检索相关内容
 */
async function searchKnowledgeBase(
  userId: string,
  agentId: string | null,
  userQuery: string,
  limit: number = 3
): Promise<string> {
  try {
    // 生成查询向量
    const queryEmbedding = await generateEmbedding(userQuery);

    let results: any[] = [];

    if (queryEmbedding) {
      // 向量相似度搜索
      try {
        const searchSql = `
          SELECT 
            kv.chunk_content,
            f.file_name,
            1 - (kv.embedding <=> $1::vector) as similarity
          FROM knowledge_vectors kv
          JOIN files f ON kv.file_id = f.id
          WHERE f.user_id = $2 ${agentId ? 'AND f.agent_id = $3' : ''}
          ORDER BY similarity DESC
          LIMIT $${agentId ? '4' : '3'}
        `;
        const params = agentId 
          ? [`[${queryEmbedding.join(',')}]`, userId, agentId, limit]
          : [`[${queryEmbedding.join(',')}]`, userId, limit];

        const searchResult = await query(searchSql, params);
        results = searchResult.rows;
        console.log(`📚 RAG: Found ${results.length} relevant chunks via vector search`);
      } catch (vectorErr: any) {
        console.warn('⚠️ Vector search failed, trying keyword search:', vectorErr.message);
      }
    }

    // 如果向量搜索失败或没有结果，回退到关键词搜索
    if (results.length === 0) {
      try {
        const keywordSql = `
          SELECT 
            kv.chunk_content,
            f.file_name,
            0.5 as similarity
          FROM knowledge_vectors kv
          JOIN files f ON kv.file_id = f.id
          WHERE f.user_id = $1 ${agentId ? 'AND f.agent_id = $2' : ''}
            AND kv.chunk_content ILIKE $${agentId ? '3' : '2'}
          LIMIT $${agentId ? '4' : '3'}
        `;
        const params = agentId 
          ? [userId, agentId, `%${userQuery}%`, limit]
          : [userId, `%${userQuery}%`, limit];

        const keywordResult = await query(keywordSql, params);
        results = keywordResult.rows;
        console.log(`📚 RAG: Found ${results.length} relevant chunks via keyword search`);
      } catch (kwErr: any) {
        console.warn('⚠️ Keyword search also failed:', kwErr.message);
      }
    }

    // 格式化检索结果
    if (results.length > 0) {
      const knowledgeContext = results.map((r, i) => 
        `【知识片段 ${i + 1}】来源: ${r.file_name}\n${r.chunk_content}`
      ).join('\n\n');

      return `\n\n=== 知识库参考资料（请优先使用以下信息回答用户问题） ===\n${knowledgeContext}\n=== 知识库参考资料结束 ===\n\n`;
    }

    return '';
  } catch (error: any) {
    console.warn('⚠️ Knowledge base search error:', error.message);
    return '';
  }
}

// 获取会话的消息（支持分页）
router.get('/session/:sessionId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, before, after } = req.query;

    // 验证会话属于当前用户
    const sessionResult = await query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, req.userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // 构建分页查询
    let sql = `
      SELECT id, type, content, sender_id, sender_name, sender_avatar, timestamp, cost,
             related_agent_id, thought_data, suggested_follow_ups, interactive_options, feedback
      FROM messages
      WHERE session_id = $1
    `;
    const params: any[] = [sessionId];

    // 游标分页（更高效）
    if (before) {
      params.push(before);
      sql += ` AND timestamp < $${params.length}`;
      sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
      params.push(Number(limit));
    } else if (after) {
      params.push(after);
      sql += ` AND timestamp > $${params.length}`;
      sql += ` ORDER BY timestamp ASC LIMIT $${params.length + 1}`;
      params.push(Number(limit));
    } else {
      // 默认获取最新的消息
      sql += ` ORDER BY timestamp ASC`;
      if (Number(limit) < 1000) {
        sql += ` LIMIT $${params.length + 1}`;
        params.push(Number(limit));
      }
    }

    const result = await query(sql, params);

    // 如果使用 before，需要反转结果
    let messages = result.rows;
    if (before) {
      messages = messages.reverse();
    }

    // 获取总消息数
    const countResult = await query(
      'SELECT COUNT(*) as total FROM messages WHERE session_id = $1',
      [sessionId]
    );

    res.json({
      messages: messages.map((msg: any) => ({
        id: msg.id,
        type: msg.type,
        content: msg.content,
        senderId: msg.sender_id,
        senderName: msg.sender_name,
        senderAvatar: msg.sender_avatar,
        timestamp: parseInt(msg.timestamp),
        cost: msg.cost ? parseFloat(msg.cost) : undefined,
        relatedAgentId: msg.related_agent_id,
        thoughtData: msg.thought_data,
        suggestedFollowUps: msg.suggested_follow_ups,
        interactiveOptions: msg.interactive_options,
        feedback: msg.feedback,
      })),
      pagination: {
        total: parseInt(countResult.rows[0].total),
        hasMore: messages.length === Number(limit),
        oldestTimestamp: messages.length > 0 ? parseInt(messages[0].timestamp) : null,
        newestTimestamp: messages.length > 0 ? parseInt(messages[messages.length - 1].timestamp) : null,
      },
    });
  } catch (error: any) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// 发送消息并获取 AI 响应（流式）
router.post('/send', authenticate, async (req: AuthRequest, res) => {
  console.log('📨 Received message send request:', { 
    sessionId: req.body.sessionId, 
    contentLength: req.body.content?.length,
    hasContextData: !!req.body.contextData,
    contextDataKeys: req.body.contextData ? Object.keys(req.body.contextData) : []
  });
  try {
    const { sessionId, content, agentId, modelOverride, contextData, systemPromptOverride } = req.body;

    if (!sessionId || !content) {
      return res.status(400).json({ error: 'Session ID and content are required' });
    }

    // 验证会话属于当前用户
    const sessionResult = await query(
      'SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, req.userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // 获取用户信息
    const userResult = await query('SELECT name, avatar FROM users WHERE id = $1', [req.userId]);
    const userName = userResult.rows[0]?.name || 'User';
    const userAvatar = userResult.rows[0]?.avatar || null;

    // 保存用户消息
    const userMessageId = `m${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await query(
      `INSERT INTO messages (id, session_id, type, content, sender_id, sender_name, sender_avatar, timestamp)
       VALUES ($1, $2, 'USER', $3, $4, $5, $6, $7)`,
      [userMessageId, sessionId, content, req.userId, userName, userAvatar, Date.now().toString()]
    );

    // 更新会话的 last_message
    await query(
      'UPDATE chat_sessions SET last_message = $1, updated_at = NOW() WHERE id = $2',
      [content.substring(0, 100), sessionId]
    );

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 代理缓冲
    
    // 禁用 Nagle 算法，确保数据立即发送
    if (res.socket) {
      res.socket.setNoDelay(true);
    }
    
    // 立即刷新响应头
    res.flushHeaders();
    // 立即发送一个注释帧，避免部分代理/浏览器等待首包导致“看起来不流”
    res.write(':\n\n');

    // 定时发送心跳，避免链路空闲被缓冲/断开（如 Nginx/Cloudflare 等）
    const keepAliveTimer = setInterval(() => {
      if (res.writableEnded) return;
      try {
        res.write(':\n\n');
      } catch {
        // ignore
      }
    }, 15_000);

    const cleanupKeepAlive = () => clearInterval(keepAliveTimer);
    res.on('close', cleanupKeepAlive);
    res.on('finish', cleanupKeepAlive);

    try {
      // 获取 Agent 信息（如果需要）
      let systemPrompt = 'You are a helpful AI assistant.';
      let agentName = 'Nexus';

      if (agentId) {
        const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
        if (agentResult.rows.length > 0) {
          const agent = agentResult.rows[0];
          systemPrompt = agent.system_prompt;
          agentName = agent.name;
        }
      }

      // 🔥 支持前端传入的 systemPromptOverride（用于 AgentBuilder 预览测试，无需先发布）
      if (systemPromptOverride && typeof systemPromptOverride === 'string' && systemPromptOverride.trim()) {
        systemPrompt = systemPromptOverride.trim();
      }

      // 获取对话历史（最近20条消息，避免token过多）
      // 注意：排除当前刚插入的用户消息，因为我们会单独添加
      const historyResult = await query(
        `SELECT type, content, sender_name, timestamp 
         FROM messages 
         WHERE session_id = $1 AND id != $2
         ORDER BY timestamp ASC 
         LIMIT 20`,
        [sessionId, userMessageId]
      );
      
      // 构建对话历史
      let conversationHistory = '';
      if (historyResult.rows.length > 0) {
        const historyMessages = historyResult.rows.map((msg: any) => {
          const role = msg.type === 'USER' ? '用户' : 'AI助手';
          // 截取AI助手的回复以避免过长，但保留关键内容
          const content = msg.content;
          return `${role}: ${content}`;
        }).join('\n\n');
        conversationHistory = `\n\n=== 对话历史（重要：请仔细阅读！当用户回复数字时，请对照上一条AI消息中的选项列表来理解用户的选择） ===\n${historyMessages}\n=== 结束对话历史 ===\n\n`;
        console.log('📚 Conversation history included:', {
          messageCount: historyResult.rows.length,
          historyLength: conversationHistory.length,
          lastUserMessage: historyResult.rows.filter((m: any) => m.type === 'USER').pop()?.content?.substring(0, 50),
          lastAIMessage: historyResult.rows.filter((m: any) => m.type !== 'USER').pop()?.content?.substring(0, 100)
        });
      } else {
        console.log('⚠️ No conversation history found (this is the first message)');
      }

      // 构建上下文提示（用户项目数据：产品名称、目标人群等）
      let contextPrompt = '';
      if (contextData && Object.keys(contextData).length > 0) {
        // 格式化上下文数据，使其更易读
        let contextString = '\n\n=== 用户项目上下文（重要：请使用这些信息，不要重复提问） ===\n';
        
        // 提取关键信息（排除内部字段）
        const contextKeys = Object.keys(contextData).filter(
          k => !k.startsWith('_') && k !== 'documents'
        );
        
        if (contextKeys.length > 0) {
          contextString += '【用户已提供的信息】\n';
          contextKeys.forEach(key => {
            const value = contextData[key];
            if (value !== null && value !== undefined && value !== '') {
              const valueStr = Array.isArray(value) 
                ? value.join('、') 
                : String(value);
              contextString += `- ${key}: ${valueStr}\n`;
            }
          });
        }
        
        // 如果有成功案例，也包含
        if (contextData._successful_examples_) {
          contextString += '\n【成功案例参考】\n';
          const examples = Array.isArray(contextData._successful_examples_) 
            ? contextData._successful_examples_ 
            : [contextData._successful_examples_];
          examples.forEach((ex: string, i: number) => {
            contextString += `案例 ${i + 1}: ${ex.substring(0, 200)}...\n`;
          });
        }
        
        contextString += '=== 结束用户项目上下文 ===\n\n';
        contextString += '⚠️ 重要提示：以上是用户已经提供的项目信息。在信息收集过程中，如果用户已经提供了某个信息（如目标受众、产品名称等），请直接使用，不要重复提问！\n\n';
        
        contextPrompt = contextString;
        
        console.log('📦 Context data included:', {
          hasContext: true,
          contextKeys: contextKeys,
          contextPromptLength: contextPrompt.length,
          hasSuccessfulExamples: !!contextData._successful_examples_
        });
      } else {
        console.log('⚠️ No context data provided');
      }

      // 生成 AI 响应（流式）
      const aiMessageId = `m${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      let fullResponse = '';

      // 获取用户偏好设置
      const userPrefsResult = await query('SELECT preferences FROM users WHERE id = $1', [req.userId]);
      let userPreferences = null;
      if (userPrefsResult.rows[0]?.preferences) {
        try {
          userPreferences = typeof userPrefsResult.rows[0].preferences === 'string' 
            ? JSON.parse(userPrefsResult.rows[0].preferences) 
            : userPrefsResult.rows[0].preferences;
        } catch (e) {
          userPreferences = null;
        }
      }

      // 🔥 知识库检索（RAG）- 自动从知识库中检索相关内容
      let knowledgeContext = '';
      if (agentId) {
        knowledgeContext = await searchKnowledgeBase(req.userId!, agentId, content, 3);
        if (knowledgeContext) {
          console.log('📚 RAG: Knowledge context injected, length:', knowledgeContext.length);
        }
      }

      // 使用优先级 API 服务（优先 NewAPI，fallback 到 Gemini）
      // 重要：将对话历史放在最前面，然后是知识库上下文，然后是项目上下文，最后是当前消息
      const fullPrompt = conversationHistory + knowledgeContext + contextPrompt + content;
      console.log('🔄 Starting AI generation stream...', {
        promptLength: fullPrompt.length,
        knowledgeContextLength: knowledgeContext.length,
        contextPromptLength: contextPrompt.length,
        contentLength: content.length,
        hasKnowledge: knowledgeContext.length > 0,
        hasContext: contextPrompt.length > 0,
        modelOverride: modelOverride || 'default'
      });
      let chunkCount = 0;
      let hasYieldedChunk = false;
      console.log('🔄 Starting stream iteration...');
      
      try {
      for await (const chunk of generateChatStream(
        fullPrompt,
        systemPrompt,
        modelOverride,
        userPreferences,
        contextData?._successful_examples_
      )) {
          hasYieldedChunk = true;
        chunkCount++;
        fullResponse += chunk;
          // 调试：打印每个 chunk（减少日志量）
          if (chunkCount <= 3 || chunkCount % 20 === 0) {
            console.log(`📦 Chunk ${chunkCount}: "${chunk.substring(0, 30)}..." (${chunk.length} chars)`);
          }
        // 立即发送每个 chunk，确保流式输出流畅
          const sseData = `data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`;
          
          // 写入数据
          const success = res.write(sseData);
          
          // 强制刷新缓冲区，确保数据立即发送到客户端
          // 这是实现真正流式输出的关键
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
          
          // 如果写入缓冲区满，等待 drain 事件
          if (!success) {
            console.log('⚠️ Buffer full, waiting for drain...');
            await new Promise<void>(resolve => res.once('drain', resolve));
          }
        }
        
        // 如果没有收到任何chunk，发送错误
        if (!hasYieldedChunk) {
          console.error('❌ No chunks yielded from generateChatStream');
          const errorData = `data: ${JSON.stringify({ type: 'error', error: 'AI service returned no response. Please check API configuration.' })}\n\n`;
          res.write(errorData);
          res.end();
          return;
        }
        
      console.log(`✅ AI generation completed: ${chunkCount} chunks, ${fullResponse.length} chars`);
      } catch (streamError: any) {
        console.error('❌ Error in stream generation:', streamError);
        const errorData = `data: ${JSON.stringify({ type: 'error', error: streamError.message || 'AI generation failed' })}\n\n`;
        res.write(errorData);
        res.end();
        return;
      }

      // 解析交互式选项（从 [OPTIONS_JSON] 标记中提取）
      let interactiveOptions = null;
      const optionsMatch = fullResponse.match(/\[OPTIONS_JSON\]([\s\S]*?)\[\/OPTIONS_JSON\]/);
      if (optionsMatch) {
        try {
          const optionsData = JSON.parse(optionsMatch[1].trim());
          if (optionsData.options && Array.isArray(optionsData.options)) {
            interactiveOptions = optionsData.options;
            // 从回复内容中移除 JSON 标记（保持内容清洁）
            fullResponse = fullResponse.replace(/\[OPTIONS_JSON\][\s\S]*?\[\/OPTIONS_JSON\]/g, '').trim();
            console.log('✅ Parsed interactive options:', interactiveOptions.length, 'options');
          }
        } catch (e) {
          console.warn('⚠️ Failed to parse options JSON:', e);
        }
      }

      // 保存 AI 响应（包含交互式选项）
      await query(
        `INSERT INTO messages (id, session_id, type, content, sender_id, sender_name, timestamp, related_agent_id, interactive_options)
         VALUES ($1, $2, 'AGENT', $3, $4, $5, $6, $7, $8)`,
        [
          aiMessageId,
          sessionId,
          fullResponse,
          agentId || 'a1',
          agentName,
          Date.now().toString(),
          agentId || 'a1',
          interactiveOptions ? JSON.stringify(interactiveOptions) : null,
        ]
      );

      // 发送完成信号
      res.write(`data: ${JSON.stringify({ type: 'done', messageId: aiMessageId })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error('AI generation error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error('Send message error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
});

// 更新消息反馈
router.patch('/:id/feedback', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    // 验证消息属于当前用户的会话
    const messageResult = await query(
      `SELECT m.id FROM messages m
       JOIN chat_sessions s ON m.session_id = s.id
       WHERE m.id = $1 AND s.user_id = $2`,
      [id, req.userId]
    );

    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await query('UPDATE messages SET feedback = $1 WHERE id = $2', [feedback, id]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update feedback error:', error);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

export default router;
