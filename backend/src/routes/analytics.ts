import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// 监控和分析 API
// ============================================

// 用户使用统计仪表板
router.get('/dashboard', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;

    // 获取今日/本周/本月使用量
    const usageResult = await query(
      `SELECT 
         SUM(CASE WHEN created_at > NOW() - INTERVAL '1 day' THEN credits_used ELSE 0 END) as today_credits,
         SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN credits_used ELSE 0 END) as week_credits,
         SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN credits_used ELSE 0 END) as month_credits,
         COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 day' THEN 1 END) as today_requests,
         COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as week_requests,
         COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as month_requests
       FROM usage_statistics
       WHERE user_id = $1`,
      [userId]
    );

    // 获取最常用的智能体
    const topAgentsResult = await query(
      `SELECT 
         us.agent_id,
         a.name as agent_name,
         a.avatar as agent_avatar,
         COUNT(*) as usage_count,
         SUM(us.credits_used) as total_credits
       FROM usage_statistics us
       LEFT JOIN agents a ON us.agent_id = a.id
       WHERE us.user_id = $1 AND us.agent_id IS NOT NULL AND us.created_at > NOW() - INTERVAL '30 days'
       GROUP BY us.agent_id, a.name, a.avatar
       ORDER BY usage_count DESC
       LIMIT 5`,
      [userId]
    );

    // 获取按日统计的使用趋势
    const trendResult = await query(
      `SELECT 
         DATE(created_at) as date,
         SUM(credits_used) as credits,
         COUNT(*) as requests
       FROM usage_statistics
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [userId]
    );

    const usage = usageResult.rows[0];

    res.json({
      summary: {
        today: {
          credits: parseFloat(usage.today_credits || 0),
          requests: parseInt(usage.today_requests || 0),
        },
        week: {
          credits: parseFloat(usage.week_credits || 0),
          requests: parseInt(usage.week_requests || 0),
        },
        month: {
          credits: parseFloat(usage.month_credits || 0),
          requests: parseInt(usage.month_requests || 0),
        },
      },
      topAgents: topAgentsResult.rows.map(row => ({
        agentId: row.agent_id,
        agentName: row.agent_name,
        agentAvatar: row.agent_avatar,
        usageCount: parseInt(row.usage_count),
        totalCredits: parseFloat(row.total_credits || 0),
      })),
      trend: trendResult.rows.map(row => ({
        date: row.date,
        credits: parseFloat(row.credits || 0),
        requests: parseInt(row.requests),
      })),
    });
  } catch (error: any) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

// 管理员系统统计
router.get('/admin/overview', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    // 用户统计
    const userStats = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_users_week,
        COUNT(CASE WHEN last_login_at > NOW() - INTERVAL '24 hours' THEN 1 END) as active_today
      FROM users
    `);

    // 智能体统计
    const agentStats = await query(`
      SELECT 
        COUNT(*) as total_agents,
        COUNT(CASE WHEN is_public = true THEN 1 END) as public_agents,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_agents_week
      FROM agents
    `);

    // 消息统计
    const messageStats = await query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN timestamp > EXTRACT(EPOCH FROM (NOW() - INTERVAL '24 hours')) * 1000 THEN 1 END) as messages_today,
        COUNT(CASE WHEN timestamp > EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000 THEN 1 END) as messages_week
      FROM messages
    `);

    // 收入统计
    const revenueStats = await query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN amount ELSE 0 END), 0) as revenue_month,
        COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN amount ELSE 0 END), 0) as revenue_week
      FROM payment_records
      WHERE status = 'completed'
    `);

    // 系统健康状态
    const healthCheck = await query('SELECT NOW() as db_time');

    res.json({
      users: {
        total: parseInt(userStats.rows[0].total_users),
        active: parseInt(userStats.rows[0].active_users),
        newThisWeek: parseInt(userStats.rows[0].new_users_week),
        activeToday: parseInt(userStats.rows[0].active_today),
      },
      agents: {
        total: parseInt(agentStats.rows[0].total_agents),
        public: parseInt(agentStats.rows[0].public_agents),
        newThisWeek: parseInt(agentStats.rows[0].new_agents_week),
      },
      messages: {
        total: parseInt(messageStats.rows[0].total_messages),
        today: parseInt(messageStats.rows[0].messages_today),
        thisWeek: parseInt(messageStats.rows[0].messages_week),
      },
      revenue: {
        total: parseFloat(revenueStats.rows[0].total_revenue),
        thisMonth: parseFloat(revenueStats.rows[0].revenue_month),
        thisWeek: parseFloat(revenueStats.rows[0].revenue_week),
      },
      systemHealth: {
        status: 'healthy',
        dbTime: healthCheck.rows[0].db_time,
        uptime: process.uptime(),
      },
    });
  } catch (error: any) {
    console.error('Get admin overview error:', error);
    res.status(500).json({ error: 'Failed to get admin overview' });
  }
});

// 管理员用户活跃度分析
router.get('/admin/user-activity', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { days = 30 } = req.query;

    // 每日活跃用户
    const dauResult = await query(
      `SELECT 
         DATE(created_at) as date,
         COUNT(DISTINCT user_id) as active_users
       FROM usage_statistics
       WHERE created_at > NOW() - INTERVAL '${Number(days)} days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    // 用户留存分析（简化版）
    const retentionResult = await query(`
      WITH cohort AS (
        SELECT 
          user_id,
          DATE(created_at) as signup_date
        FROM users
        WHERE created_at > NOW() - INTERVAL '30 days'
      ),
      activity AS (
        SELECT DISTINCT 
          user_id,
          DATE(created_at) as activity_date
        FROM usage_statistics
        WHERE created_at > NOW() - INTERVAL '30 days'
      )
      SELECT 
        c.signup_date,
        COUNT(DISTINCT c.user_id) as cohort_size,
        COUNT(DISTINCT CASE WHEN a.activity_date = c.signup_date + INTERVAL '1 day' THEN c.user_id END) as day1,
        COUNT(DISTINCT CASE WHEN a.activity_date = c.signup_date + INTERVAL '7 days' THEN c.user_id END) as day7
      FROM cohort c
      LEFT JOIN activity a ON c.user_id = a.user_id
      GROUP BY c.signup_date
      ORDER BY c.signup_date DESC
      LIMIT 10
    `);

    res.json({
      dailyActiveUsers: dauResult.rows.map(row => ({
        date: row.date,
        users: parseInt(row.active_users),
      })),
      retention: retentionResult.rows.map(row => ({
        signupDate: row.signup_date,
        cohortSize: parseInt(row.cohort_size),
        day1: parseInt(row.day1 || 0),
        day7: parseInt(row.day7 || 0),
      })),
    });
  } catch (error: any) {
    console.error('Get user activity error:', error);
    res.status(500).json({ error: 'Failed to get user activity data' });
  }
});

// 管理员审计日志
router.get('/admin/audit-logs', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 50, action, userId } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryStr = `
      SELECT 
        al.id, al.user_id, al.action, al.resource, al.resource_id, 
        al.details, al.ip, al.user_agent, al.success, al.error_message, al.created_at,
        u.name as user_name, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (action) {
      params.push(action);
      queryStr += ` AND al.action = $${params.length}`;
    }

    if (userId) {
      params.push(userId);
      queryStr += ` AND al.user_id = $${params.length}`;
    }

    queryStr += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), offset);

    const result = await query(queryStr, params);

    // 获取总数
    let countQuery = `SELECT COUNT(*) as total FROM audit_logs WHERE 1=1`;
    const countParams: any[] = [];
    if (action) {
      countParams.push(action);
      countQuery += ` AND action = $${countParams.length}`;
    }
    if (userId) {
      countParams.push(userId);
      countQuery += ` AND user_id = $${countParams.length}`;
    }
    const countResult = await query(countQuery, countParams);

    res.json({
      logs: result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        action: row.action,
        resource: row.resource,
        resourceId: row.resource_id,
        details: row.details,
        ip: row.ip,
        userAgent: row.user_agent,
        success: row.success,
        errorMessage: row.error_message,
        createdAt: row.created_at,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].total),
      },
    });
  } catch (error: any) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// 记录使用统计（内部调用）
router.post('/track', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { agentId, sessionId, actionType, creditsUsed, tokensInput, tokensOutput, modelUsed, durationMs } = req.body;

    await query(
      `INSERT INTO usage_statistics 
         (user_id, agent_id, session_id, action_type, credits_used, tokens_input, tokens_output, model_used, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, agentId, sessionId, actionType, creditsUsed || 0, tokensInput || 0, tokensOutput || 0, modelUsed, durationMs]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Track usage error:', error);
    res.status(500).json({ error: 'Failed to track usage' });
  }
});

export default router;

