import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// 所有路由都需要认证和管理员权限
router.use(authenticate);
router.use(requireAdmin);

// 获取所有提示模板
router.get('/', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, label, prompt, icon, target_agent_id, user_id, is_system, created_at
       FROM prompt_templates
       ORDER BY created_at DESC`
    );

    res.json(
      result.rows.map((template) => ({
        id: template.id,
        label: template.label,
        prompt: template.prompt,
        icon: template.icon,
        targetAgentId: template.target_agent_id,
        userId: template.user_id,
        isSystem: template.is_system,
        createdAt: template.created_at,
      }))
    );
  } catch (error: any) {
    console.error('Get prompt templates error:', error);
    res.status(500).json({ error: 'Failed to get prompt templates' });
  }
});

// 创建提示模板
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { label, prompt, icon, targetAgentId } = req.body;

    if (!label || !prompt) {
      return res.status(400).json({ error: 'Label and prompt are required' });
    }

    const templateId = `pt${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    await query(
      `INSERT INTO prompt_templates (id, label, prompt, icon, target_agent_id, user_id, is_system, created_at)
       VALUES ($1, $2, $3, $4, $5, NULL, TRUE, NOW())`,
      [
        templateId,
        label,
        prompt,
        icon || null,
        targetAgentId || null,
      ]
    );

    const result = await query('SELECT * FROM prompt_templates WHERE id = $1', [templateId]);

    res.status(201).json({
      id: result.rows[0].id,
      label: result.rows[0].label,
      prompt: result.rows[0].prompt,
      icon: result.rows[0].icon,
      targetAgentId: result.rows[0].target_agent_id,
      userId: result.rows[0].user_id,
      isSystem: result.rows[0].is_system,
      createdAt: result.rows[0].created_at,
    });
  } catch (error: any) {
    console.error('Create prompt template error:', error);
    res.status(500).json({ error: 'Failed to create prompt template' });
  }
});

// 更新提示模板
router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { label, prompt, icon, targetAgentId } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (label !== undefined) {
      updates.push(`label = $${paramIndex++}`);
      values.push(label);
    }
    if (prompt !== undefined) {
      updates.push(`prompt = $${paramIndex++}`);
      values.push(prompt);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(icon);
    }
    if (targetAgentId !== undefined) {
      updates.push(`target_agent_id = $${paramIndex++}`);
      values.push(targetAgentId);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);

    await query(
      `UPDATE prompt_templates SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    const result = await query('SELECT * FROM prompt_templates WHERE id = $1', [id]);

    res.json({
      id: result.rows[0].id,
      label: result.rows[0].label,
      prompt: result.rows[0].prompt,
      icon: result.rows[0].icon,
      targetAgentId: result.rows[0].target_agent_id,
      userId: result.rows[0].user_id,
      isSystem: result.rows[0].is_system,
      createdAt: result.rows[0].created_at,
    });
  } catch (error: any) {
    console.error('Update prompt template error:', error);
    res.status(500).json({ error: 'Failed to update prompt template' });
  }
});

// 删除提示模板
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM prompt_templates WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete prompt template error:', error);
    res.status(500).json({ error: 'Failed to delete prompt template' });
  }
});

export default router;


