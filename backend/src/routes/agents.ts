import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireAdmin, optionalAuth, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// 获取所有智能体（公开的 + 用户自己创建的）
router.get('/', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId || null;

    // 如果用户已登录，返回公开的 + 用户自己创建的智能体
    // 如果未登录，只返回公开的智能体
    const result = userId
      ? await query(
          `SELECT id, name, role, role_zh, description, description_zh, avatar, price_per_message,
                  category, system_prompt, styles, is_public, created_by, created_at, updated_at
           FROM agents
           WHERE is_public = true OR created_by = $1
           ORDER BY created_at DESC`,
          [userId]
        )
      : await query(
          `SELECT id, name, role, role_zh, description, description_zh, avatar, price_per_message,
                  category, system_prompt, styles, is_public, created_by, created_at, updated_at
           FROM agents
           WHERE is_public = true
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
        styles: agent.styles || [],
        isPublic: agent.is_public,
        createdBy: agent.created_by,
      }))
    );
  } catch (error: any) {
    console.error('Get agents error:', error);
    res.status(500).json({ error: 'Failed to get agents' });
  }
});

// 获取单个智能体
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, name, role, role_zh, description, description_zh, avatar, price_per_message,
              category, system_prompt, styles, is_public, created_by
       FROM agents
       WHERE id = $1 AND (is_public = true OR created_by = $2)`,
      [id, (req as AuthRequest).userId || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = result.rows[0];
    res.json({
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
      styles: agent.styles || [],
      isPublic: agent.is_public,
      createdBy: agent.created_by,
    });
  } catch (error: any) {
    console.error('Get agent error:', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// 创建智能体（需要认证）
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      name,
      role,
      roleZh,
      description,
      descriptionZh,
      avatar,
      pricePerMessage,
      category,
      systemPrompt,
      styles,
      isPublic,
    } = req.body;

    if (!name || !systemPrompt) {
      return res.status(400).json({ error: 'Name and systemPrompt are required' });
    }

    const agentId = `a${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // 默认可见性策略：
    // - admin 创建：默认公开（除非显式传 isPublic=false）
    // - 普通用户创建：默认私有（不允许创建公开智能体）
    const userResult = await query('SELECT role FROM users WHERE id = $1', [req.userId]);
    const userRole = userResult.rows[0]?.role || 'user';
    const isPublicValue =
      userRole === 'admin'
        ? (typeof isPublic === 'boolean' ? isPublic : true)
        : false;

    await query(
      `INSERT INTO agents (id, name, role, role_zh, description, description_zh, avatar,
                          price_per_message, category, system_prompt, styles, is_public, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
      [
        agentId,
        name,
        role || null,
        roleZh || null,
        description || null,
        descriptionZh || null,
        avatar || null,
        pricePerMessage || 0,
        category || 'General',
        systemPrompt,
        styles || [],
        isPublicValue,
        req.userId,
      ]
    );

    const result = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
    const agent = result.rows[0];
    
    res.status(201).json({
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
      styles: agent.styles || [],
      isPublic: agent.is_public,
      createdBy: agent.created_by,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    });
  } catch (error: any) {
    console.error('Create agent error:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// 更新智能体（仅创建者或管理员）
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 检查权限
    const agentResult = await query('SELECT created_by FROM agents WHERE id = $1', [id]);
    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const existingAgent = agentResult.rows[0];
    
    // 检查用户角色
    const userResult = await query('SELECT role FROM users WHERE id = $1', [req.userId]);
    const userRole = userResult.rows[0]?.role || 'user';
    
    if (existingAgent.created_by !== req.userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'name',
      'role',
      'role_zh',
      'description',
      'description_zh',
      'avatar',
      'price_per_message',
      'category',
      'system_prompt',
      'styles',
      'is_public',
    ];

    // 直接映射字段，不使用自动转换
    if (req.body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(req.body.name);
    }
    if (req.body.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(req.body.role);
    }
    if (req.body.roleZh !== undefined) {
      updates.push(`role_zh = $${paramIndex++}`);
      values.push(req.body.roleZh);
    }
    if (req.body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(req.body.description);
    }
    if (req.body.descriptionZh !== undefined) {
      updates.push(`description_zh = $${paramIndex++}`);
      values.push(req.body.descriptionZh);
    }
    if (req.body.avatar !== undefined) {
      updates.push(`avatar = $${paramIndex++}`);
      values.push(req.body.avatar);
    }
    if (req.body.pricePerMessage !== undefined) {
      updates.push(`price_per_message = $${paramIndex++}`);
      values.push(req.body.pricePerMessage);
    }
    if (req.body.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(req.body.category);
    }
    if (req.body.systemPrompt !== undefined) {
      updates.push(`system_prompt = $${paramIndex++}`);
      values.push(req.body.systemPrompt);
    }
    if (req.body.styles !== undefined) {
      updates.push(`styles = $${paramIndex++}`);
      values.push(req.body.styles);
    }
    if (req.body.isPublic !== undefined) {
      updates.push(`is_public = $${paramIndex++}`);
      values.push(req.body.isPublic);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await query(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // 返回更新后的完整数据
    const result = await query('SELECT * FROM agents WHERE id = $1', [id]);
    const agent = result.rows[0];
    
    res.json({
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
      styles: agent.styles || [],
      isPublic: agent.is_public,
      createdBy: agent.created_by,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    });
  } catch (error: any) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// 删除智能体（仅创建者或管理员）
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 检查权限
    const agentResult = await query('SELECT created_by FROM agents WHERE id = $1', [id]);
    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = agentResult.rows[0];
    
    // 检查用户角色
    const userResult = await query('SELECT role FROM users WHERE id = $1', [req.userId]);
    const userRole = userResult.rows[0]?.role || 'user';
    
    if (agent.created_by !== req.userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await query('DELETE FROM agents WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete agent error:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

export default router;

