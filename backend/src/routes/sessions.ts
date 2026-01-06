import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// 获取用户的所有会话
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, title, last_message, is_group, participants, created_at, updated_at
       FROM chat_sessions
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.userId]
    );

    const sessions = await Promise.all(
      result.rows.map(async (session) => {
        // 获取会话的消息数量（用于前端显示）
        const msgCount = await query(
          'SELECT COUNT(*) as count FROM messages WHERE session_id = $1',
          [session.id]
        );

        return {
          id: session.id,
          title: session.title,
          lastMessage: session.last_message,
          updatedAt: new Date(session.updated_at).getTime(),
          isGroup: session.is_group,
          participants: session.participants || [],
          messageCount: parseInt(msgCount.rows[0].count),
        };
      })
    );

    res.json(sessions);
  } catch (error: any) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// 创建新会话
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { title, isGroup, participants } = req.body;

    const sessionId = `s${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    await query(
      `INSERT INTO chat_sessions (id, user_id, title, last_message, is_group, participants, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [
        sessionId,
        req.userId,
        title || 'New Chat',
        '',
        isGroup || false,
        participants || [],
      ]
    );

    res.status(201).json({
      id: sessionId,
      title: title || 'New Chat',
      lastMessage: '',
      updatedAt: Date.now(),
      isGroup: isGroup || false,
      participants: participants || [],
      messages: [],
    });
  } catch (error: any) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// 获取单个会话详情（包含消息）
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 验证会话属于当前用户
    const sessionResult = await query(
      'SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // 获取消息
    const messagesResult = await query(
      `SELECT id, type, content, sender_id, sender_name, sender_avatar, timestamp, cost,
              related_agent_id, thought_data, suggested_follow_ups, interactive_options, feedback
       FROM messages
       WHERE session_id = $1
       ORDER BY timestamp ASC`,
      [id]
    );

    res.json({
      id: session.id,
      title: session.title,
      lastMessage: session.last_message,
      updatedAt: new Date(session.updated_at).getTime(),
      isGroup: session.is_group,
      participants: session.participants || [],
      messages: messagesResult.rows.map((msg) => ({
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
    });
  } catch (error: any) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// 更新会话
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { title, lastMessage } = req.body;

    // 验证会话属于当前用户
    const sessionResult = await query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (lastMessage !== undefined) {
      updates.push(`last_message = $${paramIndex++}`);
      values.push(lastMessage);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await query(
      `UPDATE chat_sessions SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// 删除会话
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 验证会话属于当前用户
    const sessionResult = await query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // 删除会话（级联删除消息）
    await query('DELETE FROM chat_sessions WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;

