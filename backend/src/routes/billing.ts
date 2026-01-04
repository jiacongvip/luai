import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { auditLog, requireConfirmation } from '../middleware/security.js';

const router = express.Router();

// ============================================
// 计费系统 API
// ============================================

// 获取用户余额和订阅信息
router.get('/balance', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;

    // 获取用户余额
    const userResult = await query(
      'SELECT credits FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 获取订阅信息
    const subResult = await query(
      `SELECT plan_id, status, current_period_start, current_period_end 
       FROM subscriptions WHERE user_id = $1`,
      [userId]
    );

    res.json({
      credits: parseFloat(userResult.rows[0].credits),
      subscription: subResult.rows[0] || null,
    });
  } catch (error: any) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// 获取交易记录
router.get('/transactions', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryStr = `
      SELECT id, amount, balance_after, type, reference_id, description, created_at
      FROM transactions
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (type) {
      queryStr += ` AND type = $2`;
      params.push(type);
    }

    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), offset);

    const result = await query(queryStr, params);

    // 获取总数
    const countResult = await query(
      `SELECT COUNT(*) as total FROM transactions WHERE user_id = $1 ${type ? 'AND type = $2' : ''}`,
      type ? [userId, type] : [userId]
    );

    res.json({
      transactions: result.rows.map(t => ({
        id: t.id,
        amount: parseFloat(t.amount),
        balanceAfter: parseFloat(t.balance_after),
        type: t.type,
        referenceId: t.reference_id,
        description: t.description,
        createdAt: t.created_at,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].total),
      },
    });
  } catch (error: any) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// 获取使用统计（按天/周/月）
router.get('/usage', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { period = '7d' } = req.query;

    let interval: string;
    let groupBy: string;
    switch (period) {
      case '30d':
        interval = '30 days';
        groupBy = 'day';
        break;
      case '90d':
        interval = '90 days';
        groupBy = 'week';
        break;
      default:
        interval = '7 days';
        groupBy = 'day';
    }

    const result = await query(
      `SELECT 
         DATE_TRUNC($1, created_at) as period,
         SUM(credits_used) as total_credits,
         SUM(tokens_input) as total_tokens_input,
         SUM(tokens_output) as total_tokens_output,
         COUNT(*) as request_count
       FROM usage_statistics
       WHERE user_id = $2 AND created_at > NOW() - INTERVAL '${interval}'
       GROUP BY DATE_TRUNC($1, created_at)
       ORDER BY period ASC`,
      [groupBy, userId]
    );

    res.json({
      period,
      data: result.rows.map(row => ({
        period: row.period,
        totalCredits: parseFloat(row.total_credits || 0),
        totalTokensInput: parseInt(row.total_tokens_input || 0),
        totalTokensOutput: parseInt(row.total_tokens_output || 0),
        requestCount: parseInt(row.request_count),
      })),
    });
  } catch (error: any) {
    console.error('Get usage error:', error);
    res.status(500).json({ error: 'Failed to get usage statistics' });
  }
});

// 获取定价方案
router.get('/plans', async (req, res) => {
  try {
    // 从系统设置获取定价方案
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'pricing_plans'`
    );

    const defaultPlans = [
      {
        id: 'starter',
        name: 'Starter',
        nameZh: '入门版',
        price: 10,
        credits: 100,
        features: ['Access to Standard Agents', 'Basic Support'],
        featuresZh: ['使用标准智能体', '基础支持'],
      },
      {
        id: 'pro',
        name: 'Pro',
        nameZh: '专业版',
        price: 50,
        credits: 600,
        popular: true,
        features: ['Access to all Expert Agents', 'Priority Support', '100 Bonus Credits'],
        featuresZh: ['使用所有专家智能体', '优先支持', '赠送100积分'],
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        nameZh: '企业版',
        price: 200,
        credits: 2500,
        features: ['Custom Agent Creation', 'API Access', 'Dedicated Account Manager'],
        featuresZh: ['自定义智能体', 'API访问', '专属客户经理'],
      },
    ];

    res.json(result.rows[0]?.value || defaultPlans);
  } catch (error: any) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Failed to get pricing plans' });
  }
});

// 创建充值订单
router.post('/recharge', authenticate, auditLog('CREATE', 'payment'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { planId, paymentMethod, amount, credits } = req.body;

    if (!paymentMethod || !amount || !credits) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const orderId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 创建支付记录
    await query(
      `INSERT INTO payment_records (id, user_id, amount, credits_purchased, payment_method, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [orderId, userId, amount, credits, paymentMethod]
    );

    // 根据支付方式返回不同的支付信息
    // 这里是模拟，实际需要集成真实的支付 SDK
    let paymentInfo: any = { orderId };

    switch (paymentMethod) {
      case 'alipay':
        // 模拟支付宝支付链接
        paymentInfo.payUrl = `https://openapi.alipay.com/gateway.do?order=${orderId}`;
        paymentInfo.qrCode = `alipay://pay?order=${orderId}`;
        break;
      case 'wechat':
        // 模拟微信支付
        paymentInfo.payUrl = `weixin://wxpay/bizpayurl?order=${orderId}`;
        paymentInfo.qrCode = `weixin://wxpay/bizpayurl?order=${orderId}`;
        break;
      case 'stripe':
        // Stripe 支付意向
        paymentInfo.clientSecret = `pi_${orderId}_secret`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid payment method' });
    }

    res.json({
      success: true,
      orderId,
      paymentInfo,
    });
  } catch (error: any) {
    console.error('Create recharge order error:', error);
    res.status(500).json({ error: 'Failed to create recharge order' });
  }
});

// 支付回调（Webhook）
router.post('/webhook/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const payload = req.body;

    console.log(`Payment webhook received from ${provider}:`, payload);

    // 验证签名（实际需要根据支付平台的规范验证）
    // const isValid = verifyWebhookSignature(provider, payload, req.headers);
    // if (!isValid) return res.status(400).json({ error: 'Invalid signature' });

    let orderId: string;
    let success: boolean;

    // 根据不同支付平台解析数据
    switch (provider) {
      case 'alipay':
        orderId = payload.out_trade_no;
        success = payload.trade_status === 'TRADE_SUCCESS';
        break;
      case 'wechat':
        orderId = payload.out_trade_no;
        success = payload.result_code === 'SUCCESS';
        break;
      case 'stripe':
        orderId = payload.data?.object?.metadata?.orderId;
        success = payload.type === 'payment_intent.succeeded';
        break;
      default:
        return res.status(400).json({ error: 'Unknown payment provider' });
    }

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID not found in payload' });
    }

    // 获取订单信息
    const orderResult = await query(
      `SELECT user_id, credits_purchased, status FROM payment_records WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // 防止重复处理
    if (order.status !== 'pending') {
      return res.json({ success: true, message: 'Already processed' });
    }

    if (success) {
      // 更新订单状态
      await query(
        `UPDATE payment_records SET status = 'completed', completed_at = NOW(), metadata = $1 WHERE id = $2`,
        [JSON.stringify(payload), orderId]
      );

      // 增加用户积分
      const updateResult = await query(
        `UPDATE users SET credits = credits + $1, updated_at = NOW() WHERE id = $2 RETURNING credits`,
        [order.credits_purchased, order.user_id]
      );

      // 记录交易
      await query(
        `INSERT INTO transactions (id, user_id, amount, balance_after, type, reference_id, description)
         VALUES ($1, $2, $3, $4, 'DEPOSIT', $5, $6)`,
        [
          `txn_${Date.now()}`,
          order.user_id,
          order.credits_purchased,
          updateResult.rows[0].credits,
          orderId,
          `Recharge via ${provider}`,
        ]
      );

      console.log(`✅ Payment completed: Order ${orderId}, Credits ${order.credits_purchased}`);
    } else {
      // 支付失败
      await query(
        `UPDATE payment_records SET status = 'failed', metadata = $1 WHERE id = $2`,
        [JSON.stringify(payload), orderId]
      );
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Payment webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// 模拟支付完成（开发测试用）
router.post('/simulate-payment', authenticate, async (req: AuthRequest, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID required' });
    }

    // 获取订单
    const orderResult = await query(
      `SELECT user_id, credits_purchased, status FROM payment_records WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (order.user_id !== userId) {
      return res.status(403).json({ error: 'Order does not belong to this user' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Order already processed' });
    }

    // 模拟支付成功
    await query(
      `UPDATE payment_records SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [orderId]
    );

    // 增加积分
    const updateResult = await query(
      `UPDATE users SET credits = credits + $1, updated_at = NOW() WHERE id = $2 RETURNING credits`,
      [order.credits_purchased, userId]
    );

    // 记录交易
    await query(
      `INSERT INTO transactions (id, user_id, amount, balance_after, type, reference_id, description)
       VALUES ($1, $2, $3, $4, 'DEPOSIT', $5, 'Simulated payment')`,
      [
        `txn_${Date.now()}`,
        userId,
        order.credits_purchased,
        updateResult.rows[0].credits,
        orderId,
      ]
    );

    res.json({
      success: true,
      newBalance: parseFloat(updateResult.rows[0].credits),
    });
  } catch (error: any) {
    console.error('Simulate payment error:', error);
    res.status(500).json({ error: 'Failed to simulate payment' });
  }
});

// 订阅管理
router.post('/subscribe', authenticate, requireConfirmation('subscribe'), auditLog('CREATE', 'subscription'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { planId, paymentMethod } = req.body;

    if (!planId || !paymentMethod) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 检查是否已有订阅
    const existingResult = await query(
      `SELECT id, status FROM subscriptions WHERE user_id = $1`,
      [userId]
    );

    const subscriptionId = `sub_${Date.now()}`;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30天后

    if (existingResult.rows.length > 0) {
      // 更新订阅
      await query(
        `UPDATE subscriptions SET 
           plan_id = $1, 
           status = 'active', 
           current_period_start = $2, 
           current_period_end = $3
         WHERE user_id = $4`,
        [planId, now, periodEnd, userId]
      );
    } else {
      // 创建新订阅
      await query(
        `INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end)
         VALUES ($1, $2, $3, 'active', $4, $5)`,
        [subscriptionId, userId, planId, now, periodEnd]
      );
    }

    res.json({
      success: true,
      subscription: {
        planId,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });
  } catch (error: any) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// 取消订阅
router.post('/cancel-subscription', authenticate, requireConfirmation('cancel-subscription'), auditLog('DELETE', 'subscription'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;

    await query(
      `UPDATE subscriptions SET status = 'canceled' WHERE user_id = $1`,
      [userId]
    );

    res.json({ success: true, message: 'Subscription canceled' });
  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;

