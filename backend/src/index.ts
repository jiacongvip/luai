import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import sessionRoutes from './routes/sessions.js';
import messageRoutes from './routes/messages.js';
import agentRoutes from './routes/agents.js';
import adminRoutes from './routes/admin.js';
import projectRoutes from './routes/projects.js';
import squadRoutes from './routes/squads.js';
import promptTemplateRoutes from './routes/prompt-templates.js';
import workflowRoutes from './routes/workflows.js';
import billingRoutes from './routes/billing.js';
import analyticsRoutes from './routes/analytics.js';
import filesRoutes from './routes/files.js';
import exportRoutes from './routes/export.js';
import apiConfigRoutes from './routes/api-config.js';
import preferencesRoutes from './routes/preferences.js';
import systemSettingsRoutes from './routes/system-settings.js';
import debugRoutes from './routes/debug.js';
import personacraftRoutes from './routes/personacraft.js';
import { securityHeaders, xssProtection, sqlInjectionProtection, rateLimitPresets } from './middleware/security.js';
import { swaggerDocument } from './swagger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// 安全中间件
// ============================================
// 安全响应头
app.use(securityHeaders);

// CORS 配置
const corsOriginAllowlist = new Set<string>([
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost:4001',
  'http://127.0.0.1:4001',
  ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
]);

app.use(cors({
  origin: (origin, callback) => {
    // allow non-browser requests (no Origin header)
    if (!origin) return callback(null, true);

    // explicit allowlist
    if (corsOriginAllowlist.has(origin)) return callback(null, true);

    // allow any localhost/127.0.0.1 port in dev
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return callback(null, true);
      }
    } catch {
      // ignore parsing errors
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Confirm-Token'],
}));

// 请求体解析
app.use(express.json({ limit: '10mb' })); // 限制请求体大小
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// XSS 防护
app.use(xssProtection);

// SQL 注入防护
app.use(sqlInjectionProtection);

// 全局速率限制（100请求/分钟）
app.use(rateLimitPresets.standard);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 文档（Swagger UI 简化版）
app.get('/api/docs', (req, res) => {
  res.json(swaggerDocument);
});

// Swagger UI HTML 页面
app.get('/api/docs/ui', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Nexus API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout'
    });
  </script>
</body>
</html>
  `);
});

// API 路由
app.use('/api/auth', rateLimitPresets.auth, authRoutes); // 登录限流
app.use('/api/users', userRoutes);
app.use('/api/sessions', rateLimitPresets.sessions, sessionRoutes); // 会话限流（提高限制）
app.use('/api/messages', rateLimitPresets.messages, messageRoutes); // 消息限流
app.use('/api/agents', agentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/squads', squadRoutes);
app.use('/api/prompt-templates', promptTemplateRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/billing', rateLimitPresets.payment, billingRoutes); // 支付限流
app.use('/api/analytics', analyticsRoutes);
app.use('/api/files', rateLimitPresets.upload, filesRoutes); // 上传限流
app.use('/api/export', exportRoutes);
app.use('/api/admin/api-configs', apiConfigRoutes); // API 配置管理
app.use('/api/preferences', preferencesRoutes); // 用户偏好设置
app.use('/api/system-settings', systemSettingsRoutes); // 系统级全局设置
app.use('/api/debug', debugRoutes); // SSE 自检（排查代理缓冲/首包问题）
app.use('/api/personacraft', personacraftRoutes); // PersonaCraft AI 知识库优化

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// 启动服务器
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api`);
  
  // 初始化数据库Schema（迁移preferences字段）
  try {
    const { ensurePreferencesSchema } = await import('./services/preferencesMigration.js');
    await ensurePreferencesSchema();
  } catch (error) {
    console.error('⚠️ Failed to migrate preferences schema:', error);
  }

  // 迁移 interactive_options 字段
  try {
    const { query } = await import('./db/connection.js');
    await query(`
      ALTER TABLE messages 
      ADD COLUMN IF NOT EXISTS interactive_options JSONB
    `);
    console.log('✅ Interactive options column migrated');
  } catch (error) {
    console.error('⚠️ Failed to migrate interactive_options column:', error);
  }
  
  // 迁移 agents.welcome_message 字段（欢迎语）
  try {
    const { query } = await import('./db/connection.js');
    await query(`
      ALTER TABLE agents 
      ADD COLUMN IF NOT EXISTS welcome_message TEXT
    `);
    console.log('✅ Agents welcome_message column migrated');
  } catch (error) {
    console.error('⚠️ Failed to migrate welcome_message column:', error);
  }
  
  // 初始化 WebSocket 服务（类似 ChatGPT、Claude 的实现）
  try {
    import('./services/websocketService.js').then(({ websocketService }) => {
      websocketService.initialize(server);
    }).catch((error) => {
      console.error('⚠️ Failed to initialize WebSocket service:', error);
      console.log('📡 Continuing without WebSocket support');
    });
  } catch (error) {
    console.error('⚠️ Failed to load WebSocket service:', error);
    console.log('📡 Continuing without WebSocket support');
  }
});
