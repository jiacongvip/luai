import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { executeWorkflow, getExecutionHistory, getExecutionDetails } from '../services/workflowEngine.js';
import { auditLog } from '../middleware/security.js';

const router = express.Router();

// 获取工作流列表和执行工作流需要认证
// 创建/更新/删除需要管理员权限

// 获取所有已发布的工作流（用户）
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, nodes, edges, status, created_by, created_at, updated_at
       FROM workflows
       ORDER BY updated_at DESC`
    );

    res.json(
      result.rows.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes,
        edges: workflow.edges,
        status: workflow.status,
        createdBy: workflow.created_by,
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at,
      }))
    );
  } catch (error: any) {
    console.error('Get workflows error:', error);
    res.status(500).json({ error: 'Failed to get workflows' });
  }
});

// 创建工作流（管理员）
router.post('/', authenticate, requireAdmin, auditLog('CREATE', 'workflow'), async (req: AuthRequest, res) => {
  try {
    const { name, description, nodes, edges, status } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const workflowId = `wf${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    await query(
      `INSERT INTO workflows (id, name, description, nodes, edges, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        workflowId,
        name,
        description || null,
        JSON.stringify(nodes || []),
        JSON.stringify(edges || []),
        status || 'draft',
        req.userId,
      ]
    );

    const result = await query('SELECT * FROM workflows WHERE id = $1', [workflowId]);

    res.status(201).json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      nodes: result.rows[0].nodes,
      edges: result.rows[0].edges,
      status: result.rows[0].status,
      createdBy: result.rows[0].created_by,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error: any) {
    console.error('Create workflow error:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// 更新工作流（管理员）
router.patch('/:id', authenticate, requireAdmin, auditLog('UPDATE', 'workflow'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, nodes, edges, status } = req.body;

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
    if (nodes !== undefined) {
      updates.push(`nodes = $${paramIndex++}`);
      values.push(JSON.stringify(nodes));
    }
    if (edges !== undefined) {
      updates.push(`edges = $${paramIndex++}`);
      values.push(JSON.stringify(edges));
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
      `UPDATE workflows SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    const result = await query('SELECT * FROM workflows WHERE id = $1', [id]);

    res.json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      nodes: result.rows[0].nodes,
      edges: result.rows[0].edges,
      status: result.rows[0].status,
      createdBy: result.rows[0].created_by,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error: any) {
    console.error('Update workflow error:', error);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// 删除工作流（管理员）
router.delete('/:id', authenticate, requireAdmin, auditLog('DELETE', 'workflow'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM workflows WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete workflow error:', error);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// ============================================
// 工作流执行 API
// ============================================

// 执行工作流
router.post('/:id/execute', authenticate, auditLog('EXECUTE', 'workflow'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { input, projectData } = req.body;
    const userId = req.userId!;

    if (!input) {
      return res.status(400).json({ error: 'Input is required' });
    }

    // 获取工作流
    const workflowResult = await query(
      `SELECT * FROM workflows WHERE id = $1 AND status = 'published'`,
      [id]
    );

    if (workflowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found or not published' });
    }

    const workflow = {
      id: workflowResult.rows[0].id,
      name: workflowResult.rows[0].name,
      nodes: workflowResult.rows[0].nodes,
      edges: workflowResult.rows[0].edges,
      status: workflowResult.rows[0].status as 'draft' | 'published',
    };

    // 执行工作流
    const result = await executeWorkflow(workflow, input, userId, projectData);

    res.json(result);
  } catch (error: any) {
    console.error('Execute workflow error:', error);
    res.status(500).json({ error: 'Failed to execute workflow' });
  }
});

// 获取执行历史
router.get('/executions', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { workflowId, limit } = req.query;

    const history = await getExecutionHistory(
      userId,
      workflowId as string | undefined,
      limit ? parseInt(limit as string) : 20
    );

    res.json(history);
  } catch (error: any) {
    console.error('Get execution history error:', error);
    res.status(500).json({ error: 'Failed to get execution history' });
  }
});

// 获取执行详情
router.get('/executions/:executionId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { executionId } = req.params;

    const details = await getExecutionDetails(executionId);

    if (!details) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json(details);
  } catch (error: any) {
    console.error('Get execution details error:', error);
    res.status(500).json({ error: 'Failed to get execution details' });
  }
});

export default router;


