import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// 所有路由都需要认证和管理员权限
router.use(authenticate);
router.use(requireAdmin);

// 获取所有群组
router.get('/', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, avatar, member_agent_ids, assigned_to_user_ids, created_by, created_at, updated_at
       FROM squads
       ORDER BY created_at DESC`
    );

    res.json(
      result.rows.map((squad) => ({
        id: squad.id,
        name: squad.name,
        description: squad.description,
        avatar: squad.avatar,
        memberAgentIds: squad.member_agent_ids || [],
        assignedToUserIds: squad.assigned_to_user_ids || [],
        createdBy: squad.created_by,
        createdAt: squad.created_at,
        updatedAt: squad.updated_at,
      }))
    );
  } catch (error: any) {
    console.error('Get squads error:', error);
    res.status(500).json({ error: 'Failed to get squads' });
  }
});

// 创建群组
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, description, avatar, memberAgentIds, assignedToUserIds } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const squadId = `sq${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    await query(
      `INSERT INTO squads (id, name, description, avatar, member_agent_ids, assigned_to_user_ids, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        squadId,
        name,
        description || null,
        avatar || null,
        memberAgentIds || [],
        assignedToUserIds || [],
        req.userId,
      ]
    );

    const result = await query('SELECT * FROM squads WHERE id = $1', [squadId]);

    res.status(201).json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      avatar: result.rows[0].avatar,
      memberAgentIds: result.rows[0].member_agent_ids || [],
      assignedToUserIds: result.rows[0].assigned_to_user_ids || [],
      createdBy: result.rows[0].created_by,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error: any) {
    console.error('Create squad error:', error);
    res.status(500).json({ error: 'Failed to create squad' });
  }
});

// 更新群组
router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, avatar, memberAgentIds, assignedToUserIds } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (avatar !== undefined) {
      updates.push(`avatar = $${paramIndex++}`);
      values.push(avatar);
    }
    if (memberAgentIds !== undefined) {
      updates.push(`member_agent_ids = $${paramIndex++}`);
      values.push(memberAgentIds);
    }
    if (assignedToUserIds !== undefined) {
      updates.push(`assigned_to_user_ids = $${paramIndex++}`);
      values.push(assignedToUserIds);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await query(
      `UPDATE squads SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    const result = await query('SELECT * FROM squads WHERE id = $1', [id]);

    res.json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      avatar: result.rows[0].avatar,
      memberAgentIds: result.rows[0].member_agent_ids || [],
      assignedToUserIds: result.rows[0].assigned_to_user_ids || [],
      createdBy: result.rows[0].created_by,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error: any) {
    console.error('Update squad error:', error);
    res.status(500).json({ error: 'Failed to update squad' });
  }
});

// 删除群组
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM squads WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete squad error:', error);
    res.status(500).json({ error: 'Failed to delete squad' });
  }
});

export default router;


