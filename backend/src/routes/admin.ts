import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// 所有管理路由都需要认证和管理员权限
router.use(authenticate);
router.use(requireAdmin);

// 系统统计
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    // 用户统计
    const usersCount = await query('SELECT COUNT(*) as count FROM users');
    const activeUsersCount = await query("SELECT COUNT(*) as count FROM users WHERE status = 'active'");
    
    // 会话统计
    const sessionsCount = await query('SELECT COUNT(*) as count FROM chat_sessions');
    
    // 消息统计
    const messagesCount = await query('SELECT COUNT(*) as count FROM messages');
    
    // 智能体统计
    const agentsCount = await query('SELECT COUNT(*) as count FROM agents');
    
    // 最近注册用户
    const recentUsers = await query(
      'SELECT id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT 10'
    );

    res.json({
      users: {
        total: parseInt(usersCount.rows[0].count),
        active: parseInt(activeUsersCount.rows[0].count),
      },
      sessions: {
        total: parseInt(sessionsCount.rows[0].count),
      },
      messages: {
        total: parseInt(messagesCount.rows[0].count),
      },
      agents: {
        total: parseInt(agentsCount.rows[0].count),
      },
      recentUsers: recentUsers.rows.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// 用户管理
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = 'SELECT id, email, name, credits, role, status, created_at, last_login_at FROM users';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      queryText += ` WHERE email ILIKE $${paramIndex} OR name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Number(limit), offset);

    const result = await query(queryText, params);
    const countResult = await query('SELECT COUNT(*) as count FROM users' + (search ? ` WHERE email ILIKE $1 OR name ILIKE $1` : ''), search ? [`%${search}%`] : []);

    res.json({
      users: result.rows.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        credits: parseFloat(u.credits),
        role: u.role,
        status: u.status,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
      })),
      total: parseInt(countResult.rows[0].count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error: any) {
    console.error('Get admin users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// 更新用户
router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, credits, role, status } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (credits !== undefined) {
      updates.push(`credits = $${paramIndex++}`);
      values.push(credits);
    }
    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// 删除用户
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 防止删除自己
    if (id === (req as AuthRequest).userId) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    await query('DELETE FROM users WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// 获取所有智能体（包括私有）
router.get('/agents', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, role, role_zh, description, description_zh, avatar, price_per_message,
              category, system_prompt, welcome_message, styles, is_public, created_by, created_at, updated_at
       FROM agents
       ORDER BY created_at DESC`
    );

    res.json(
      result.rows.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        roleZh: agent.role_zh,
        description: agent.description,
        descriptionZh: agent.description_zh,
        avatar: agent.avatar,
        pricePerMessage: parseFloat(agent.price_per_message),
        category: agent.category,
        systemPrompt: agent.system_prompt,
        welcomeMessage: agent.welcome_message || '',
        styles: agent.styles || [],
        isPublic: agent.is_public,
        createdBy: agent.created_by,
        createdAt: agent.created_at,
        updatedAt: agent.updated_at,
      }))
    );
  } catch (error: any) {
    console.error('Get admin agents error:', error);
    res.status(500).json({ error: 'Failed to get agents' });
  }
});

// 一键发布当前管理员创建的所有智能体（让前端用户端可见）
router.post('/agents/publish-all', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `UPDATE agents
       SET is_public = true, updated_at = NOW()
       WHERE created_by = $1`,
      [req.userId]
    );

    res.json({ success: true, updated: result.rowCount || 0 });
  } catch (error: any) {
    console.error('Publish all agents error:', error);
    res.status(500).json({ error: 'Failed to publish agents' });
  }
});

// 系统设置
router.get('/settings', async (req, res) => {
  try {
    const result = await query(
      "SELECT key, value, description FROM system_settings WHERE key IN ('onboarding_config', 'available_models', 'feature_flags', 'gemini_api_key')"
    );

    const settings: Record<string, any> = {};
    result.rows.forEach(row => {
      // 对于敏感信息（如 API key），只返回提示，不返回完整值
      if (row.key === 'gemini_api_key' && row.value) {
        const apiKey = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        settings[row.key] = apiKey && apiKey.length > 4 ? `...${apiKey.slice(-4)}` : '****';
        settings[`${row.key}_has_value`] = true;
      } else {
        settings[row.key] = row.value;
      }
    });

    res.json(settings);
  } catch (error: any) {
    console.error('Get admin settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// 更新系统设置
router.post('/settings', async (req, res) => {
  try {
    const { key, value, description } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }

    await query(
      `INSERT INTO system_settings (key, value, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, description = $3, updated_at = NOW()`,
      [key, JSON.stringify(value), description || null]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;

