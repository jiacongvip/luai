import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// 默认系统设置
const DEFAULT_SYSTEM_SETTINGS = {
  // 功能开关（全局生效）
  showTrendAnalysis: true,
  showSimulator: true,
  enableStylePrompt: true,
  showGoalLanding: false,
  enableWebSocket: false,
  showContextDrawer: true,
  showThoughtChain: true,
  showFollowUps: true,
  showRichActions: true,
  allowModelSelect: true,
  
  // 模型配置
  modelName: 'gemini-3-flash-preview',
  availableModels: [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite' },
  ],
  
  // 智能体分类
  agentCategories: ['General', 'Writing', 'Coding', 'Marketing', 'Data'],
};

/**
 * 获取系统设置（公开接口，前台需要读取）
 * GET /api/system-settings
 */
router.get('/', async (req, res) => {
  try {
    const result = await query(
      "SELECT key, value FROM system_settings WHERE key = 'feature_flags'"
    );

    let settings = { ...DEFAULT_SYSTEM_SETTINGS };
    
    if (result.rows.length > 0) {
      const dbSettings = result.rows[0].value;
      // 合并数据库设置和默认值
      settings = { ...settings, ...dbSettings };
    }

    res.json(settings);
  } catch (error: any) {
    console.error('Get system settings error:', error);
    // 返回默认值，避免前端崩溃
    res.json(DEFAULT_SYSTEM_SETTINGS);
  }
});

/**
 * 更新系统设置（需要管理员权限）
 * PATCH /api/system-settings
 */
router.patch('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const updates = req.body;

    // 获取当前设置
    const result = await query(
      "SELECT value FROM system_settings WHERE key = 'feature_flags'"
    );

    let currentSettings = { ...DEFAULT_SYSTEM_SETTINGS };
    if (result.rows.length > 0) {
      currentSettings = { ...currentSettings, ...result.rows[0].value };
    }

    // 合并更新
    const updatedSettings = { ...currentSettings, ...updates };

    // 如果记录不存在，插入；否则更新
    if (result.rows.length === 0) {
      await query(
        `INSERT INTO system_settings (key, value, description, updated_at) 
         VALUES ('feature_flags', $1::jsonb, '系统功能开关和全局配置', NOW())`,
        [JSON.stringify(updatedSettings)]
      );
    } else {
      await query(
        `UPDATE system_settings SET value = $1::jsonb, updated_at = NOW() WHERE key = 'feature_flags'`,
        [JSON.stringify(updatedSettings)]
      );
    }

    console.log('✅ System settings updated:', Object.keys(updates));
    
    res.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (error: any) {
    console.error('Update system settings error:', error);
    res.status(500).json({ error: 'Failed to update system settings' });
  }
});

/**
 * 重置系统设置为默认值
 * POST /api/system-settings/reset
 */
router.post('/reset', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    await query(
      `INSERT INTO system_settings (key, value, description, updated_at) 
       VALUES ('feature_flags', $1::jsonb, '系统功能开关和全局配置', NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(DEFAULT_SYSTEM_SETTINGS)]
    );

    res.json({
      success: true,
      settings: DEFAULT_SYSTEM_SETTINGS,
    });
  } catch (error: any) {
    console.error('Reset system settings error:', error);
    res.status(500).json({ error: 'Failed to reset system settings' });
  }
});

export default router;

