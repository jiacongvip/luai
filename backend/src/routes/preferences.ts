import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// 所有偏好设置路由都需要认证
router.use(authenticate);

// ============================================
// 用户偏好设置 API
// ============================================

/**
 * 获取当前用户的所有偏好设置
 * GET /api/preferences
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;

    const result = await query(
      'SELECT preferences FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const preferences = result.rows[0].preferences || {};

    res.json({
      preferences: preferences,
    });
  } catch (error: any) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

/**
 * 更新用户偏好设置（部分更新）
 * PATCH /api/preferences
 * Body: { theme?, mode?, language?, modelName?, featureFlags?, ... }
 */
router.patch('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const updates = req.body;

    // 获取当前偏好设置
    const currentResult = await query(
      'SELECT preferences FROM users WHERE id = $1',
      [userId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentPrefs = currentResult.rows[0].preferences || {};

    // 深度合并新设置
    const updatedPrefs = {
      ...currentPrefs,
      ...updates,
      // 特殊处理 featureFlags - 支持部分更新
      ...(updates.featureFlags && {
        featureFlags: {
          ...(currentPrefs.featureFlags || {}),
          ...updates.featureFlags,
        },
      }),
    };

    // 更新数据库（明确 cast 为 jsonb，避免驱动把字符串当普通 text）
    await query(
      'UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updatedPrefs), userId]
    );

    res.json({
      success: true,
      preferences: updatedPrefs,
    });
  } catch (error: any) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * 重置用户偏好设置为默认值
 * POST /api/preferences/reset
 */
router.post('/reset', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;

    const defaultPrefs = {
      theme: 'blue',
      mode: 'dark',
      language: 'zh',
      modelName: 'gemini-3-flash-preview',
      featureFlags: {
        showContextDrawer: true,
        showThoughtChain: true,
        showFollowUps: true,
        showRichActions: true,
        showTrendAnalysis: true,
        showSimulator: true,
        enableStylePrompt: true,
        showGoalLanding: false,
        enableWebSocket: false,
        allowModelSelect: true,
      },
    };

    await query(
      'UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(defaultPrefs), userId]
    );

    res.json({
      success: true,
      preferences: defaultPrefs,
    });
  } catch (error: any) {
    console.error('Reset preferences error:', error);
    res.status(500).json({ error: 'Failed to reset preferences' });
  }
});

/**
 * 更新单个功能开关
 * PATCH /api/preferences/feature/:feature
 * Body: { enabled: boolean }
 */
router.patch('/feature/:feature', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const featureName = req.params.feature;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    // 获取当前偏好设置
    const currentResult = await query(
      'SELECT preferences FROM users WHERE id = $1',
      [userId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentPrefs = currentResult.rows[0].preferences || {};
    const updatedPrefs = {
      ...currentPrefs,
      featureFlags: {
        ...(currentPrefs.featureFlags || {}),
        [featureName]: enabled,
      },
    };

    await query(
      'UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updatedPrefs), userId]
    );

    res.json({
      success: true,
      preferences: updatedPrefs,
    });
  } catch (error: any) {
    console.error('Update feature flag error:', error);
    res.status(500).json({ error: 'Failed to update feature flag' });
  }
});

export default router;

