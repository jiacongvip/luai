import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/security.js';

const router = express.Router();

// ============================================
// 数据导出 API
// ============================================

// 获取导出任务列表
router.get('/jobs', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;

    const result = await query(
      `SELECT id, export_type, status, file_path, file_size, error_message, created_at, completed_at, expires_at
       FROM export_jobs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    res.json(result.rows.map(job => ({
      id: job.id,
      exportType: job.export_type,
      status: job.status,
      filePath: job.file_path,
      fileSize: job.file_size,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      expiresAt: job.expires_at,
    })));
  } catch (error: any) {
    console.error('Get export jobs error:', error);
    res.status(500).json({ error: 'Failed to get export jobs' });
  }
});

// 创建导出任务
router.post('/create', authenticate, auditLog('CREATE', 'export'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { exportType, format = 'json' } = req.body;

    if (!exportType || !['sessions', 'messages', 'agents', 'projects', 'all'].includes(exportType)) {
      return res.status(400).json({ error: 'Invalid export type' });
    }

    const jobId = `export_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 创建导出任务
    await query(
      `INSERT INTO export_jobs (id, user_id, export_type, status)
       VALUES ($1, $2, $3, 'processing')`,
      [jobId, userId, exportType]
    );

    // 异步处理导出（实际应该放入队列）
    processExport(jobId, userId, exportType, format).catch(console.error);

    res.json({
      success: true,
      jobId,
      message: 'Export job created. Check status with GET /api/export/jobs',
    });
  } catch (error: any) {
    console.error('Create export error:', error);
    res.status(500).json({ error: 'Failed to create export job' });
  }
});

// 处理导出任务
async function processExport(jobId: string, userId: string, exportType: string, format: string) {
  try {
    let data: any = {};

    // 根据导出类型获取数据
    if (exportType === 'sessions' || exportType === 'all') {
      const sessionsResult = await query(
        `SELECT id, title, last_message, is_group, participants, created_at, updated_at
         FROM chat_sessions WHERE user_id = $1`,
        [userId]
      );
      data.sessions = sessionsResult.rows;
    }

    if (exportType === 'messages' || exportType === 'all') {
      const messagesResult = await query(
        `SELECT m.id, m.session_id, m.type, m.content, m.sender_id, m.sender_name, 
                m.timestamp, m.cost, m.related_agent_id, m.feedback
         FROM messages m
         JOIN chat_sessions s ON m.session_id = s.id
         WHERE s.user_id = $1
         ORDER BY m.timestamp ASC`,
        [userId]
      );
      data.messages = messagesResult.rows;
    }

    if (exportType === 'agents' || exportType === 'all') {
      const agentsResult = await query(
        `SELECT id, name, role, role_zh, description, description_zh, avatar, 
                price_per_message, category, system_prompt, styles, is_public
         FROM agents WHERE created_by = $1`,
        [userId]
      );
      data.agents = agentsResult.rows;
    }

    if (exportType === 'projects' || exportType === 'all') {
      const projectsResult = await query(
        `SELECT id, name, description, data, created_at, updated_at
         FROM projects WHERE user_id = $1`,
        [userId]
      );
      data.projects = projectsResult.rows;
    }

    // 生成导出内容
    let content: string;
    let fileType: string;

    if (format === 'csv' && exportType !== 'all') {
      content = convertToCSV(data[exportType] || []);
      fileType = 'text/csv';
    } else {
      content = JSON.stringify(data, null, 2);
      fileType = 'application/json';
    }

    const fileSize = Buffer.byteLength(content, 'utf-8');
    const filePath = `/exports/${userId}/${jobId}.${format === 'csv' ? 'csv' : 'json'}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后过期

    // 更新任务状态
    await query(
      `UPDATE export_jobs SET 
         status = 'completed', 
         file_path = $1, 
         file_size = $2, 
         completed_at = NOW(),
         expires_at = $3
       WHERE id = $4`,
      [filePath, fileSize, expiresAt, jobId]
    );

    // 实际应该将文件存储到 S3/GCS
    // 这里暂时存储到数据库的 file_path 字段作为标识

    console.log(`✅ Export job ${jobId} completed. Size: ${fileSize} bytes`);
  } catch (error: any) {
    console.error(`Export job ${jobId} failed:`, error);
    await query(
      `UPDATE export_jobs SET status = 'failed', error_message = $1 WHERE id = $2`,
      [error.message, jobId]
    );
  }
}

// 转换为 CSV 格式
function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(item =>
    headers.map(header => {
      const value = item[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
      return String(value).replace(/"/g, '""');
    }).map(v => `"${v}"`).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

// 下载导出文件
router.get('/download/:jobId', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { jobId } = req.params;

    const result = await query(
      `SELECT export_type, status, file_path, expires_at FROM export_jobs WHERE id = $1 AND user_id = $2`,
      [jobId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Export job not found' });
    }

    const job = result.rows[0];

    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Export job not completed', status: job.status });
    }

    if (new Date() > new Date(job.expires_at)) {
      return res.status(410).json({ error: 'Export file has expired' });
    }

    // 实际应该从 S3/GCS 获取文件
    // 这里重新生成数据作为演示
    const exportType = job.export_type;
    let data: any = {};

    if (exportType === 'sessions' || exportType === 'all') {
      const sessionsResult = await query(
        `SELECT id, title, last_message, is_group, participants, created_at, updated_at
         FROM chat_sessions WHERE user_id = $1`,
        [userId]
      );
      data.sessions = sessionsResult.rows;
    }

    if (exportType === 'messages' || exportType === 'all') {
      const messagesResult = await query(
        `SELECT m.id, m.session_id, m.type, m.content, m.sender_id, m.sender_name, 
                m.timestamp, m.cost, m.related_agent_id, m.feedback
         FROM messages m
         JOIN chat_sessions s ON m.session_id = s.id
         WHERE s.user_id = $1
         ORDER BY m.timestamp ASC`,
        [userId]
      );
      data.messages = messagesResult.rows;
    }

    if (exportType === 'agents' || exportType === 'all') {
      const agentsResult = await query(
        `SELECT id, name, role, role_zh, description, description_zh, avatar, 
                price_per_message, category, system_prompt, styles, is_public
         FROM agents WHERE created_by = $1`,
        [userId]
      );
      data.agents = agentsResult.rows;
    }

    if (exportType === 'projects' || exportType === 'all') {
      const projectsResult = await query(
        `SELECT id, name, description, data, created_at, updated_at
         FROM projects WHERE user_id = $1`,
        [userId]
      );
      data.projects = projectsResult.rows;
    }

    const content = JSON.stringify(data, null, 2);
    const fileName = `nexus_export_${exportType}_${new Date().toISOString().split('T')[0]}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(content);
  } catch (error: any) {
    console.error('Download export error:', error);
    res.status(500).json({ error: 'Failed to download export' });
  }
});

// 导入数据
router.post('/import', authenticate, auditLog('CREATE', 'import'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { data, importType } = req.body;

    if (!data || !importType) {
      return res.status(400).json({ error: 'Missing data or import type' });
    }

    let importedCount = 0;

    // 导入会话
    if ((importType === 'sessions' || importType === 'all') && data.sessions) {
      for (const session of data.sessions) {
        const newId = `s_import_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        await query(
          `INSERT INTO chat_sessions (id, user_id, title, last_message, is_group, participants)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [newId, userId, session.title, session.last_message, session.is_group || false, session.participants || []]
        );
        importedCount++;
      }
    }

    // 导入智能体
    if ((importType === 'agents' || importType === 'all') && data.agents) {
      for (const agent of data.agents) {
        const newId = `a_import_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        await query(
          `INSERT INTO agents (id, name, role, role_zh, description, description_zh, avatar, 
                              price_per_message, category, system_prompt, styles, is_public, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO NOTHING`,
          [
            newId, agent.name, agent.role, agent.role_zh, agent.description, agent.description_zh,
            agent.avatar, agent.price_per_message || 0, agent.category, agent.system_prompt || 'You are a helpful assistant.',
            agent.styles || [], false, userId
          ]
        );
        importedCount++;
      }
    }

    // 导入项目
    if ((importType === 'projects' || importType === 'all') && data.projects) {
      for (const project of data.projects) {
        const newId = `p_import_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        await query(
          `INSERT INTO projects (id, user_id, name, description, data)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [newId, userId, project.name, project.description, project.data || {}]
        );
        importedCount++;
      }
    }

    res.json({
      success: true,
      importedCount,
      message: `Successfully imported ${importedCount} items`,
    });
  } catch (error: any) {
    console.error('Import data error:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

export default router;

