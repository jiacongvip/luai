import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  generateAgentResponseStream,
  classifyMessageIntent,
  generateFollowUpQuestions,
  detectContextUpdate,
} from '../services/geminiService.js';
import { generateChatStream } from '../services/apiService.js';

const router = express.Router();

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
             related_agent_id, thought_data, suggested_follow_ups, feedback
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
    const { sessionId, content, agentId, modelOverride, contextData } = req.body;

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
          return `${role}: ${msg.content}`;
        }).join('\n\n');
        conversationHistory = `\n\n=== 对话历史（请仔细阅读，不要重复提问已收集的信息） ===\n${historyMessages}\n=== 结束对话历史 ===\n\n`;
        console.log('📚 Conversation history included:', {
          messageCount: historyResult.rows.length,
          historyLength: conversationHistory.length,
          lastMessage: historyResult.rows[historyResult.rows.length - 1]?.content?.substring(0, 50)
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

      // 使用优先级 API 服务（优先 NewAPI，fallback 到 Gemini）
      // 重要：将对话历史放在最前面，然后是项目上下文，最后是当前消息
      const fullPrompt = conversationHistory + contextPrompt + content;
      console.log('🔄 Starting AI generation stream...', {
        promptLength: fullPrompt.length,
        contextPromptLength: contextPrompt.length,
        contentLength: content.length,
        hasContext: contextPrompt.length > 0
      });
      let chunkCount = 0;
      console.log('🔄 Starting stream iteration...');
      for await (const chunk of generateChatStream(
        fullPrompt,
        systemPrompt,
        modelOverride,
        userPreferences,
        contextData?._successful_examples_
      )) {
        chunkCount++;
        fullResponse += chunk;
        // 调试：打印每个 chunk
        if (chunkCount <= 5 || chunkCount % 10 === 0) {
          console.log(`📦 Chunk ${chunkCount}: "${chunk.substring(0, 50)}..." (${chunk.length} chars)`);
        }
        // 立即发送每个 chunk，确保流式输出流畅
        const sseData = `data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`;
        const success = res.write(sseData);
        
        // 如果写入缓冲区满，等待 drain 事件
        if (!success) {
          console.log('⚠️ Buffer full, waiting for drain...');
          await new Promise<void>(resolve => res.once('drain', resolve));
        }
      }
      console.log(`✅ AI generation completed: ${chunkCount} chunks, ${fullResponse.length} chars`);

      // 保存 AI 响应
      await query(
        `INSERT INTO messages (id, session_id, type, content, sender_id, sender_name, timestamp, related_agent_id)
         VALUES ($1, $2, 'AGENT', $3, $4, $5, $6, $7)`,
        [
          aiMessageId,
          sessionId,
          fullResponse,
          agentId || 'a1',
          agentName,
          Date.now().toString(),
          agentId || 'a1',
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

