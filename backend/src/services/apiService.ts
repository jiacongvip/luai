import { query } from '../db/connection.js';

export interface ApiConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  modelMapping?: Record<string, string>;
  requestConfig?: {
    authHeaderFormat?: string;
    headers?: Record<string, string>;
  };
  isActive: boolean;
}

/**
 * 获取激活的 API 配置（按优先级排序）
 * 优先级：newapi > openai > anthropic > custom > gemini (fallback)
 */
export async function getActiveApiConfig(provider?: string): Promise<ApiConfig | null> {
  try {
    // 如果指定了 provider，优先查找该 provider
    if (provider) {
      const result = await query(
        `SELECT id, name, provider, base_url, encrypted_api_key, model_mapping, request_config, is_active
         FROM api_configs 
         WHERE provider = $1 AND is_active = true 
         ORDER BY 
           CASE provider
             WHEN 'newapi' THEN 1
             WHEN 'openai' THEN 2
             WHEN 'anthropic' THEN 3
             WHEN 'custom' THEN 4
             ELSE 5
           END
         LIMIT 1`,
        [provider]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const apiKey = Buffer.from(row.encrypted_api_key, 'base64').toString('utf-8');
        console.log(`✅ Found API config: ${row.provider} (${row.name})`);
        return {
          id: row.id,
          name: row.name,
          provider: row.provider,
          baseUrl: row.base_url,
          apiKey,
          modelMapping: row.model_mapping ? (typeof row.model_mapping === 'string' ? JSON.parse(row.model_mapping) : row.model_mapping) : undefined,
          requestConfig: row.request_config ? (typeof row.request_config === 'string' ? JSON.parse(row.request_config) : row.request_config) : undefined,
          isActive: row.is_active,
        };
      }
    }

    // 否则按优先级查找所有激活的配置
    const result = await query(
      `SELECT id, name, provider, base_url, encrypted_api_key, model_mapping, request_config, is_active
       FROM api_configs 
       WHERE is_active = true 
       ORDER BY 
         CASE provider
           WHEN 'newapi' THEN 1
           WHEN 'openai' THEN 2
           WHEN 'anthropic' THEN 3
           WHEN 'custom' THEN 4
           ELSE 5
         END
       LIMIT 1`
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const apiKey = Buffer.from(row.encrypted_api_key, 'base64').toString('utf-8');
      console.log(`✅ Found API config: ${row.provider} (${row.name}) - ${row.base_url}`);
      return {
        id: row.id,
        name: row.name,
        provider: row.provider,
        baseUrl: row.base_url,
        apiKey,
        modelMapping: row.model_mapping ? (typeof row.model_mapping === 'string' ? JSON.parse(row.model_mapping) : row.model_mapping) : undefined,
        requestConfig: row.request_config ? (typeof row.request_config === 'string' ? JSON.parse(row.request_config) : row.request_config) : undefined,
        isActive: row.is_active,
      };
    }

    console.warn('⚠️ No active API config found');
    return null;
  } catch (error: any) {
    console.error('❌ Error getting API config:', error);
    return null;
  }
}

/**
 * 使用配置的 API 发送聊天请求（流式）
 */
export async function* generateChatStream(
  prompt: string,
  systemInstruction: string,
  modelOverride?: string,
  userPreferences?: any,
  contextExamples?: string[]
): AsyncGenerator<string, void, unknown> {
  // 1. 优先使用配置的 API
  const apiConfig = await getActiveApiConfig();
  
  if (apiConfig) {
    console.log(`🚀 Using ${apiConfig.provider} API: ${apiConfig.name}`);
    try {
      yield* generateWithConfigApi(apiConfig, prompt, systemInstruction, modelOverride, userPreferences, contextExamples);
      return;
    } catch (error: any) {
      console.error(`❌ Failed to use ${apiConfig.provider} API:`, error.message);
      // 不要回退到 Gemini，直接抛出错误
      throw error;
    }
  } else {
    console.warn('⚠️ No API config found');
    yield `⚠️ **Error**: No API configuration found. Please configure an API in the admin settings.`;
    return;
  }

  // 2. Fallback 到 Gemini API（仅在 NewAPI 配置失败时）
  // 注意：如果 NewAPI 配置存在但调用失败，不应该回退到 Gemini
  // 因为用户明确配置了 NewAPI，应该使用它
  console.warn('⚠️ No active API config, attempting Gemini fallback');
  try {
    const { generateAgentResponseStream } = await import('./geminiService.js');
    yield* generateAgentResponseStream(prompt, systemInstruction, modelOverride, userPreferences, contextExamples);
  } catch (error: any) {
    console.error('❌ Gemini fallback also failed:', error.message);
    yield `⚠️ **Error**: ${error.message || 'AI service unavailable. Please check API configuration.'}`;
  }
}

/**
 * 使用配置的 API 生成响应
 */
async function* generateWithConfigApi(
  config: ApiConfig,
  prompt: string,
  systemInstruction: string,
  modelOverride?: string,
  userPreferences?: any,
  contextExamples?: string[]
): AsyncGenerator<string, void, unknown> {
  // 构建完整的系统提示
  let finalSystemInstruction = systemInstruction;
  
  if (userPreferences && typeof userPreferences === 'string' && userPreferences.trim()) {
    finalSystemInstruction += `\n\n[GLOBAL USER MEMORY & PREFERENCES]:\n${userPreferences}\n\n(IMPORTANT: You MUST respect the above Global Preferences in your response.)`;
  }

  if (contextExamples && contextExamples.length > 0) {
    finalSystemInstruction += `\n\n[SUCCESSFUL EXAMPLES / KNOWLEDGE BASE]:\nHere are past outputs that the user liked. Use them as a style reference (Few-Shot Learning):\n`;
    contextExamples.forEach((ex, i) => {
      finalSystemInstruction += `\n--- Example ${i + 1} ---\n${ex.substring(0, 500)}...\n`;
    });
  }

  // 选择模型：直接使用前端传来的模型名称，或使用默认值
  const model = modelOverride || config.modelMapping?.['default'] || 'deepseek-chat';
  console.log(`📝 Using model: ${model}`);
  
  // 构建请求
  const requestConfig = config.requestConfig || {};
  const authHeader = requestConfig.authHeaderFormat 
    ? requestConfig.authHeaderFormat.replace('{apiKey}', config.apiKey)
    : `Bearer ${config.apiKey}`;

  const url = `${config.baseUrl}/v1/chat/completions`;
  
  const requestBody = {
    model: model,
    messages: [
      { role: 'system', content: finalSystemInstruction },
      { role: 'user', content: prompt }
    ],
    stream: true,
    temperature: 0.7,
    max_tokens: 2000,
  };

  console.log(`📡 Calling ${config.provider} API: ${url}`);
  console.log(`📝 Model: ${model}, Messages: ${requestBody.messages.length}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      ...(requestConfig.headers || {}),
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ API request failed: ${response.status}`, errorText);
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }
  
  console.log(`✅ API response OK: ${response.status}`);

  // 处理流式响应
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Failed to get response reader');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  let readCount = 0;
  let yieldCount = 0;
  console.log('🔄 Starting to read stream from upstream API...');
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      readCount++;
      
      if (done) {
        console.log(`📭 Stream ended after ${readCount} reads, yielded ${yieldCount} chunks`);
        break;
      }

      const decodedValue = decoder.decode(value, { stream: true });
      buffer += decodedValue;
      
      // 调试：打印原始数据
      if (readCount <= 3) {
        console.log(`📨 Read ${readCount}: ${decodedValue.length} bytes, buffer: ${buffer.length} bytes`);
      }
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim();
          if (data === '[DONE]') {
            console.log('✅ Received [DONE] signal');
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              yieldCount++;
              // 调试：打印前几个 yield
              if (yieldCount <= 3) {
                console.log(`📤 Yield ${yieldCount}: "${content.substring(0, 30)}..."`);
              }
              yield content;
            }
          } catch (e) {
            if (data && data.trim() && data !== '[DONE]') {
              console.warn('⚠️ Failed to parse chunk:', data.substring(0, 100));
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
    console.log(`🔚 Stream reader released. Total reads: ${readCount}, yields: ${yieldCount}`);
  }
}

