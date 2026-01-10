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
  
  // 自动运行数据库迁移（如果表不存在）
  try {
    const { query } = await import('./db/connection.js');
    // 检查 users 表是否存在
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('🔄 Tables not found, running database migration...');
      // 直接执行迁移逻辑
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      
      // 读取 schema
      const possiblePaths = [
        join(__dirname, '../../../utils/postgresSchema.ts'),
        join('/app', 'utils/postgresSchema.ts'),
        join(process.cwd(), 'utils/postgresSchema.ts'),
      ];
      
      let schemaSQL = '';
      for (const path of possiblePaths) {
        try {
          const content = readFileSync(path, 'utf-8');
          const match = content.match(/export const POSTGRES_SCHEMA = `([\s\S]*?)`;/);
          if (match) {
            schemaSQL = match[1].trim();
            break;
          }
        } catch {
          continue;
        }
      }
      
      if (!schemaSQL) {
        // 使用简化版 schema
        schemaSQL = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  avatar TEXT,
  role VARCHAR(50) DEFAULT 'user',
  status VARCHAR(50) DEFAULT 'active',
  credits DECIMAL(10, 4) DEFAULT 0.0000,
  preferences TEXT,
  active_project_id VARCHAR(255),
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  role_zh VARCHAR(100),
  description TEXT,
  description_zh TEXT,
  avatar TEXT,
  price_per_message DECIMAL(10, 4) DEFAULT 0.00,
  category VARCHAR(100),
  system_prompt TEXT NOT NULL,
  styles TEXT[],
  is_public BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  last_message TEXT,
  is_group BOOLEAN DEFAULT FALSE,
  participants TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  sender_id VARCHAR(255),
  sender_name VARCHAR(255),
  sender_avatar TEXT,
  timestamp BIGINT NOT NULL,
  cost DECIMAL(10, 4) DEFAULT 0,
  related_agent_id VARCHAR(255),
  thought_data JSONB,
  suggested_follow_ups JSONB,
  interactive_options JSONB,
  feedback VARCHAR(20)
);
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS api_configs (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  api_key_hint VARCHAR(20),
  base_url TEXT NOT NULL,
  model_mapping JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT,
  request_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
        `.trim();
      }
      
      // 执行迁移
      const statements = schemaSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));
      
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await query(statement + ';');
            console.log(`✅ Created table/index: ${statement.substring(0, 50)}...`);
          } catch (err: any) {
            if (!err.message?.includes('already exists') && !err.message?.includes('duplicate')) {
              console.error(`⚠️ Migration warning: ${err.message}`);
            }
          }
        }
      }
      
      console.log('✅ Database migration completed');
    } else {
      console.log('✅ Database tables already exist');
    }
  } catch (error) {
    console.error('⚠️ Failed to check/run migration:', error);
    console.log('📡 Continuing startup...');
  }
  
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
