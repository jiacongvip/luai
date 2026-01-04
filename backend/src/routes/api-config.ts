import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/security.js';

const router = express.Router();

// 所有路由都需要认证和管理员权限
router.use(authenticate);
router.use(requireAdmin);

// ============================================
// API 配置管理
// ============================================

// 获取所有 API 配置
router.get('/', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, name, provider, api_key_hint, base_url, model_mapping, is_active, 
              created_at, updated_at, description
       FROM api_configs
       ORDER BY created_at DESC`
    );

    res.json(
      result.rows.map((config) => ({
        id: config.id,
        name: config.name,
        provider: config.provider,
        apiKeyHint: config.api_key_hint, // 只显示后4位
        baseUrl: config.base_url,
        modelMapping: config.model_mapping,
        isActive: config.is_active,
        description: config.description,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      }))
    );
  } catch (error: any) {
    console.error('Get API configs error:', error);
    res.status(500).json({ error: 'Failed to get API configs' });
  }
});

// 获取单个 API 配置（包含完整 API Key）
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, name, provider, encrypted_api_key, base_url, model_mapping, is_active, 
              description, request_config
       FROM api_configs
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API config not found' });
    }

    const config = result.rows[0];

    // 解密 API Key（简化版，实际应该使用 AES 加密）
    let apiKey = '';
    try {
      if (config.encrypted_api_key) {
        // 这里应该使用真实的解密逻辑
        // 暂时直接返回（实际应该使用 crypto 库解密）
        apiKey = Buffer.from(config.encrypted_api_key, 'base64').toString('utf-8');
      }
    } catch (e) {
      console.warn('Failed to decrypt API key:', e);
    }

    res.json({
      id: config.id,
      name: config.name,
      provider: config.provider,
      apiKey, // 完整 API Key（仅管理员可见）
      baseUrl: config.base_url,
      modelMapping: config.model_mapping,
      isActive: config.is_active,
      description: config.description,
      requestConfig: config.request_config,
    });
  } catch (error: any) {
    console.error('Get API config error:', error);
    res.status(500).json({ error: 'Failed to get API config' });
  }
});

// 创建 API 配置
router.post('/', auditLog('CREATE', 'api-config'), async (req: AuthRequest, res) => {
  try {
    const { name, provider, apiKey, baseUrl, modelMapping, description, requestConfig, isActive } = req.body;

    if (!name || !provider || !apiKey || !baseUrl) {
      return res.status(400).json({ error: 'Missing required fields: name, provider, apiKey, baseUrl' });
    }

    const configId = `api_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 加密 API Key（简化版，实际应该使用 AES-256）
    const encryptedKey = Buffer.from(apiKey).toString('base64');
    const apiKeyHint = apiKey.length > 4 ? `...${apiKey.slice(-4)}` : '****';

    await query(
      `INSERT INTO api_configs (id, name, provider, encrypted_api_key, api_key_hint, base_url, 
                               model_mapping, is_active, description, request_config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
      [
        configId,
        name,
        provider,
        encryptedKey,
        apiKeyHint,
        baseUrl,
        JSON.stringify(modelMapping || {}),
        isActive !== false,
        description || null,
        JSON.stringify(requestConfig || {}),
      ]
    );

    const result = await query('SELECT * FROM api_configs WHERE id = $1', [configId]);

    res.status(201).json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      provider: result.rows[0].provider,
      apiKeyHint: result.rows[0].api_key_hint,
      baseUrl: result.rows[0].base_url,
      modelMapping: result.rows[0].model_mapping,
      isActive: result.rows[0].is_active,
      description: result.rows[0].description,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error: any) {
    console.error('Create API config error:', error);
    res.status(500).json({ error: 'Failed to create API config' });
  }
});

// 更新 API 配置
router.patch('/:id', auditLog('UPDATE', 'api-config'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, provider, apiKey, baseUrl, modelMapping, description, requestConfig, isActive } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (provider !== undefined) {
      updates.push(`provider = $${paramIndex++}`);
      values.push(provider);
    }
    if (apiKey !== undefined) {
      // 更新 API Key
      const encryptedKey = Buffer.from(apiKey).toString('base64');
      const apiKeyHint = apiKey.length > 4 ? `...${apiKey.slice(-4)}` : '****';
      updates.push(`encrypted_api_key = $${paramIndex++}`);
      updates.push(`api_key_hint = $${paramIndex++}`);
      values.push(encryptedKey, apiKeyHint);
    }
    if (baseUrl !== undefined) {
      updates.push(`base_url = $${paramIndex++}`);
      values.push(baseUrl);
    }
    if (modelMapping !== undefined) {
      updates.push(`model_mapping = $${paramIndex++}`);
      values.push(JSON.stringify(modelMapping));
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (requestConfig !== undefined) {
      updates.push(`request_config = $${paramIndex++}`);
      values.push(JSON.stringify(requestConfig));
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await query(
      `UPDATE api_configs SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    const result = await query('SELECT * FROM api_configs WHERE id = $1', [id]);

    res.json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      provider: result.rows[0].provider,
      apiKeyHint: result.rows[0].api_key_hint,
      baseUrl: result.rows[0].base_url,
      modelMapping: result.rows[0].model_mapping,
      isActive: result.rows[0].is_active,
      description: result.rows[0].description,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error: any) {
    console.error('Update API config error:', error);
    res.status(500).json({ error: 'Failed to update API config' });
  }
});

// 删除 API 配置
router.delete('/:id', auditLog('DELETE', 'api-config'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM api_configs WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete API config error:', error);
    res.status(500).json({ error: 'Failed to delete API config' });
  }
});

// 测试 API 配置连接
router.post('/:id/test', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT encrypted_api_key, base_url, request_config, provider FROM api_configs WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API config not found' });
    }

    const config = result.rows[0];
    const apiKey = Buffer.from(config.encrypted_api_key, 'base64').toString('utf-8');
    const requestConfig = config.request_config || {};
    const provider = config.provider || 'custom';

    const authHeader = requestConfig.authHeaderFormat 
      ? requestConfig.authHeaderFormat.replace('{apiKey}', apiKey)
      : `Bearer ${apiKey}`;

    const testResults: any[] = [];

    // 测试 1: 获取模型列表
    try {
      const modelsUrl = `${config.base_url}/v1/models`;
      const modelsResponse = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          ...(requestConfig.headers || {}),
        },
      });

      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json();
        const availableModels = modelsData.data?.map((m: any) => m.id) || [];
        
        testResults.push({
          test: 'models_list',
          success: true,
          message: `成功获取模型列表 (${availableModels.length} 个模型)`,
          models: availableModels.slice(0, 5), // 只返回前5个
        });

        // 测试 2: 使用第一个可用模型测试聊天接口
        if (availableModels.length > 0) {
          const testModel = availableModels[0];
          const chatUrl = `${config.base_url}/v1/chat/completions`;
          
          try {
            const chatResponse = await fetch(chatUrl, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                ...(requestConfig.headers || {}),
              },
              body: JSON.stringify({
                model: testModel,
                messages: [{ role: 'user', content: '测试' }],
                max_tokens: 10,
              }),
            });

            if (chatResponse.ok) {
              const chatData = await chatResponse.json();
              testResults.push({
                test: 'chat_completion',
                success: true,
                message: `聊天接口测试成功 (模型: ${testModel})`,
                response: chatData.choices?.[0]?.message?.content || '无内容',
              });
            } else {
              const errorData = await chatResponse.json().catch(() => ({}));
              testResults.push({
                test: 'chat_completion',
                success: false,
                message: `聊天接口测试失败: ${chatResponse.status} ${errorData.error?.message || chatResponse.statusText}`,
                status: chatResponse.status,
              });
            }
          } catch (chatError: any) {
            testResults.push({
              test: 'chat_completion',
              success: false,
              message: `聊天接口请求错误: ${chatError.message}`,
            });
          }
        }
      } else {
        const errorData = await modelsResponse.json().catch(() => ({}));
        testResults.push({
          test: 'models_list',
          success: false,
          message: `获取模型列表失败: ${modelsResponse.status} ${errorData.error?.message || modelsResponse.statusText}`,
          status: modelsResponse.status,
        });
      }
    } catch (error: any) {
      testResults.push({
        test: 'models_list',
        success: false,
        message: `连接错误: ${error.message}`,
      });
    }

    // 判断整体测试结果
    const allSuccess = testResults.every(r => r.success);
    const hasPartialSuccess = testResults.some(r => r.success);

    res.json({
      success: allSuccess,
      message: allSuccess 
        ? '所有测试通过！API 配置正常' 
        : hasPartialSuccess 
          ? '部分测试通过，请检查配置' 
          : '所有测试失败，请检查 API Key 和 URL',
      results: testResults,
      summary: {
        total: testResults.length,
        passed: testResults.filter(r => r.success).length,
        failed: testResults.filter(r => !r.success).length,
      },
    });
  } catch (error: any) {
    console.error('Test API config error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to test API config',
      message: error.message,
    });
  }
});

export default router;

