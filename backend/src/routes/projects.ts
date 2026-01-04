import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// 获取用户的所有项目
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, data, created_at, updated_at
       FROM projects
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.userId]
    );

    res.json(
      result.rows.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        data: p.data,
        updatedAt: new Date(p.updated_at).getTime(),
      }))
    );
  } catch (error: any) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

// 创建新项目
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, description, data } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const projectId = `p${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    await query(
      `INSERT INTO projects (id, user_id, name, description, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [
        projectId,
        req.userId,
        name,
        description || null,
        data ? JSON.stringify(data) : '{}',
      ]
    );

    const result = await query('SELECT * FROM projects WHERE id = $1', [projectId]);

    res.status(201).json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      data: result.rows[0].data,
      updatedAt: new Date(result.rows[0].updated_at).getTime(),
    });
  } catch (error: any) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// 更新项目
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, data } = req.body;

    // 验证项目属于当前用户
    const projectResult = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

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
    if (data !== undefined) {
      updates.push(`data = $${paramIndex++}`);
      values.push(typeof data === 'string' ? data : JSON.stringify(data));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await query(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // 返回更新后的项目
    const result = await query('SELECT * FROM projects WHERE id = $1', [id]);
    res.json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      data: result.rows[0].data,
      updatedAt: new Date(result.rows[0].updated_at).getTime(),
    });
  } catch (error: any) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// 删除项目
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 验证项目属于当前用户
    const projectResult = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await query('DELETE FROM projects WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;

