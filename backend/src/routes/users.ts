import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// 获取当前用户信息
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, email, name, credits, role, status, avatar, preferences, active_project_id, created_at, last_login_at
       FROM users WHERE id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // 获取用户的项目
    const projectsResult = await query(
      'SELECT id, name, description, data, updated_at FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.userId]
    );

    // 解析 preferences JSON
    let preferences = null;
    if (user.preferences) {
      try {
        preferences = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences;
      } catch (e) {
        preferences = null;
      }
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      credits: parseFloat(user.credits),
      role: user.role,
      status: user.status,
      avatar: user.avatar,
      preferences: preferences,
      activeProjectId: user.active_project_id,
      projects: projectsResult.rows.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        data: p.data,
        updatedAt: new Date(p.updated_at).getTime(),
      })),
      createdAt: user.created_at ? new Date(user.created_at).getTime() : null,
      lastLoginAt: user.last_login_at ? new Date(user.last_login_at).getTime() : null,
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// 更新当前用户信息
router.patch('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, avatar, preferences, activeProjectId } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (avatar !== undefined) {
      updates.push(`avatar = $${paramIndex++}`);
      values.push(avatar);
    }
    if (preferences !== undefined) {
      updates.push(`preferences = $${paramIndex++}`);
      values.push(typeof preferences === 'string' ? preferences : JSON.stringify(preferences));
    }
    if (activeProjectId !== undefined) {
      updates.push(`active_project_id = $${paramIndex++}`);
      values.push(activeProjectId);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.userId);

    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // 返回更新后的用户信息
    const result = await query('SELECT * FROM users WHERE id = $1', [req.userId]);
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// 获取所有用户（仅管理员）
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, name, credits, role, status, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

export default router;

