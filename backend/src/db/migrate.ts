import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取 PostgreSQL Schema
// 尝试多个可能的路径（支持 Docker 和本地开发）
const possiblePaths = [
  join(__dirname, '../../../utils/postgresSchema.ts'),  // 本地开发
  join('/app', 'utils/postgresSchema.ts'),               // Docker 容器（修复路径）
  join(process.cwd(), 'utils/postgresSchema.ts'),        // 备用路径
];

let schemaSQL = '';
let schemaPath = '';

for (const path of possiblePaths) {
  try {
    const content = readFileSync(path, 'utf-8');
    const match = content.match(/export const POSTGRES_SCHEMA = `([\s\S]*?)`;/);
    if (match) {
      schemaSQL = match[1].trim();
      schemaPath = path;
      break;
    }
  } catch (error) {
    // 继续尝试下一个路径
    continue;
  }
}

// 如果无法读取文件，使用内联 SQL（简化版）
if (!schemaSQL) {
  console.warn('⚠️  无法读取 postgresSchema.ts，使用简化版 Schema');
  schemaSQL = `
-- Users Table
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

-- Agents Table
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

-- Chat Sessions
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

-- Messages
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
  feedback VARCHAR(20)
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
`;
}

async function migrate() {
  try {
    console.log('🔄 Starting database migration...');
    if (schemaPath) {
      console.log(`📄 Using schema from: ${schemaPath}`);
    }
    
    // 测试连接
    await query('SELECT NOW()');
    console.log('✅ Database connection verified');

    // 执行 Schema SQL
    const statements = schemaSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await query(statement + ';');
          const preview = statement.substring(0, 60).replace(/\s+/g, ' ');
          console.log(`✅ Executed: ${preview}...`);
        } catch (err: any) {
          // 忽略已存在的错误
          if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
            const preview = statement.substring(0, 60).replace(/\s+/g, ' ');
            console.log(`⚠️  Skipped (already exists): ${preview}...`);
          } else {
            console.error(`❌ Error executing: ${statement.substring(0, 60)}...`);
            console.error(err.message);
          }
        }
      }
    }

    console.log('✅ Migration completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
