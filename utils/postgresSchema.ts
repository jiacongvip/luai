
// This file defines the PostgreSQL schema required to migrate from LocalStorage.
// It maps 1:1 with the TypeScript interfaces in types.ts and supports the full SaaS feature set.

export const POSTGRES_SCHEMA = `
-- ==========================================
-- EXTENSIONS
-- ==========================================
-- Enable pgvector for RAG (Retrieval Augmented Generation) embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ==========================================
-- 1. IDENTITY & ACCESS MANAGEMENT (IAM)
-- ==========================================

-- Users Table
-- Maps to 'User' type in types.ts
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY, -- e.g. 'u1', 'user_123...'
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255), -- Nullable if using OAuth providers
  avatar TEXT,
  role VARCHAR(50) DEFAULT 'user', -- 'admin', 'user'
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'suspended'
  credits DECIMAL(10, 4) DEFAULT 0.0000, -- Current wallet balance
  preferences TEXT, -- Global system instructions/long-term memory
  active_project_id VARCHAR(255), -- Persist last open project state
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User API Keys
-- Allows users to bring their own keys (BYOK) for specific providers
CREATE TABLE api_keys (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'google', 'openai', 'anthropic'
  key_hint VARCHAR(10), -- Last 4 chars for display (e.g. "...45aB")
  encrypted_key TEXT NOT NULL, -- AES-256 encrypted value
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. CORE MARKETPLACE ENTITIES
-- ==========================================

-- Agents Table
-- Maps to 'Agent' type. Defines AI personas.
CREATE TABLE agents (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100), -- English role
  role_zh VARCHAR(100), -- Chinese role
  description TEXT,
  description_zh TEXT,
  avatar TEXT,
  price_per_message DECIMAL(10, 4) DEFAULT 0.00,
  category VARCHAR(100), -- 'General', 'Coding', 'Marketing'
  system_prompt TEXT NOT NULL, -- The core personality instruction
  styles TEXT[], -- Array of strings e.g. ['Professional', 'Sarcastic']
  is_public BOOLEAN DEFAULT TRUE, -- False = Private custom agent
  created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agent Squads Table
-- Maps to 'AgentSquad' type. Groups of agents.
CREATE TABLE squads (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  avatar TEXT,
  member_agent_ids TEXT[], -- Array of agent_ids referencing agents(id)
  assigned_to_user_ids TEXT[], -- Access control list: which users can see this squad
  created_by VARCHAR(255) DEFAULT 'system',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Prompt Templates
-- Maps to 'PromptTemplate' type. Quick actions.
CREATE TABLE prompt_templates (
  id VARCHAR(255) PRIMARY KEY,
  label VARCHAR(255) NOT NULL, -- e.g. "Generate {{industry}} Copy"
  prompt TEXT NOT NULL, -- The actual prompt with {{variables}}
  icon VARCHAR(50), -- Lucide icon name
  target_agent_id VARCHAR(255) REFERENCES agents(id) ON DELETE SET NULL,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE, -- Null = System template
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 3. KNOWLEDGE & CONTEXT (RAG LAYER)
-- ==========================================

-- Projects Table (Contexts)
-- Maps to 'ProjectContext' type. Containers for user variables/knowledge.
CREATE TABLE projects (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  data JSONB DEFAULT '{}'::jsonb, -- Stores dynamic form fields (UserProfileData)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Files Table
-- Metadata for uploaded files (PDFs, Docs) used in Contexts or Agent Knowledge.
CREATE TABLE files (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE, -- File belongs to a project context
  agent_id VARCHAR(255) REFERENCES agents(id) ON DELETE CASCADE, -- OR File belongs to an agent's KB
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(50), -- 'application/pdf', 'text/plain'
  file_size BIGINT,
  storage_path TEXT NOT NULL, -- S3/GCS Object URL or local path
  content_text TEXT, -- Extracted text for keyword search
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Vectors Table
-- Stores embeddings for RAG.
CREATE TABLE knowledge_vectors (
  id VARCHAR(255) PRIMARY KEY,
  file_id VARCHAR(255) NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER,
  chunk_content TEXT NOT NULL, -- The text segment
  embedding vector(768), -- Gemini embedding dimension (usually 768)
  metadata JSONB -- e.g. { "page": 1, "source": "handbook.pdf" }
);

-- ==========================================
-- 4. WORKFLOW ORCHESTRATION
-- ==========================================

-- Workflows Table (Definitions)
-- Maps to 'Workflow' type. Visual graph definitions.
CREATE TABLE workflows (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of ReactFlow Nodes
  edges JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of ReactFlow Edges
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'published'
  created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL, -- 'System' or User ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agent Workflows Table (Per-Agent visual editor graph)
-- Stores the node/edge graph for an individual Agent (Coze-like builder).
CREATE TABLE agent_workflows (
  agent_id VARCHAR(255) PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Workflow Executions Table (Runtime)
-- Logs every time a workflow is run.
CREATE TABLE workflow_executions (
  id VARCHAR(255) PRIMARY KEY,
  workflow_id VARCHAR(255) REFERENCES workflows(id) ON DELETE SET NULL,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  input_data JSONB, -- Initial input provided by user
  output_data JSONB, -- Final result
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Workflow Node Logs (Debug)
-- Detailed logs for each step within an execution.
CREATE TABLE workflow_node_logs (
  id VARCHAR(255) PRIMARY KEY,
  execution_id VARCHAR(255) REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL, -- ReactFlow Node ID
  node_type VARCHAR(50) NOT NULL, -- 'llm', 'agent', 'condition'...
  status VARCHAR(50) NOT NULL, -- 'success', 'error'
  input_snapshot JSONB,
  output_snapshot JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 5. COMMUNICATION
-- ==========================================

-- Chat Sessions
-- Maps to 'ChatSession' type.
CREATE TABLE chat_sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  last_message TEXT,
  is_group BOOLEAN DEFAULT FALSE,
  participants TEXT[], -- Array of Agent IDs involved
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages
-- Maps to 'Message' type.
CREATE TABLE messages (
  id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'USER', 'AGENT', 'SYSTEM_INFO', 'THOUGHT_CHAIN'
  content TEXT NOT NULL,
  sender_id VARCHAR(255), -- User ID or Agent ID
  sender_name VARCHAR(255),
  sender_avatar TEXT,
  timestamp BIGINT NOT NULL, -- JS Timestamp
  
  -- Metadata
  cost DECIMAL(10, 4) DEFAULT 0,
  token_count_input INT,
  token_count_output INT,
  model_used VARCHAR(100), -- e.g. 'gemini-3-flash'
  
  -- Agent/Reasoning Data
  related_agent_id VARCHAR(255), -- If message came from specific agent
  thought_data JSONB, -- Stores { step, intent, contextUsed } for Thought Chain
  suggested_follow_ups JSONB, -- Array of strings
  feedback VARCHAR(20) -- 'like', 'dislike'
);

-- Notifications
-- In-app alerts for users.
CREATE TABLE notifications (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'info', 'success', 'warning', 'error'
  title VARCHAR(255) NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  link_url TEXT, -- Deep link (e.g. to a chat session)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 6. FEATURE SPECIFIC DATA
-- ==========================================

-- Saved Posts (Simulator)
-- Stores drafts from the Xiaohongshu Simulator.
CREATE TABLE saved_posts (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  content TEXT,
  image_url TEXT,
  platform VARCHAR(50) DEFAULT 'rednote', -- 'rednote', 'tiktok', 'linkedin'
  likes_count VARCHAR(20),
  saved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trend Analysis History
-- Stores results from the Viral Analysis tool.
CREATE TABLE trend_analysis (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_link TEXT,
  manual_context TEXT,
  result_data JSONB NOT NULL, -- The full JSON result (score, hooks, script...)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 7. BILLING & ADMINISTRATION
-- ==========================================

-- Subscriptions
-- Manages recurring SaaS plans.
CREATE TABLE subscriptions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_id VARCHAR(50) NOT NULL, -- 'starter', 'pro', 'enterprise'
  status VARCHAR(50) NOT NULL, -- 'active', 'canceled', 'past_due'
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  payment_provider_id VARCHAR(255), -- Stripe Customer ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions (General Ledger)
-- Immutable record of all credit movements.
CREATE TABLE transactions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id),
  amount DECIMAL(10, 4) NOT NULL, -- Negative for usage, Positive for deposits
  balance_after DECIMAL(10, 4) NOT NULL, -- Audit trail of balance
  type VARCHAR(50) NOT NULL, -- 'USAGE', 'DEPOSIT', 'REFUND', 'SUBSCRIPTION'
  reference_id VARCHAR(255), -- e.g. message_id or stripe_charge_id
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System Settings
-- Global configuration store (replaces localStorage config).
CREATE TABLE system_settings (
  key VARCHAR(100) PRIMARY KEY, -- e.g. 'onboarding_config', 'available_models', 'feature_flags'
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
-- Security and Admin action tracking.
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255), -- 操作者ID
  action VARCHAR(100) NOT NULL, -- 'LOGIN', 'CREATE', 'UPDATE', 'DELETE'
  resource VARCHAR(100) NOT NULL, -- 'users', 'agents', 'sessions'
  resource_id VARCHAR(255), -- 被操作资源的ID
  details JSONB, -- 详细信息
  ip VARCHAR(45),
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment Records (支付记录)
CREATE TABLE payment_records (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL, -- 支付金额（元）
  credits_purchased DECIMAL(10, 4) NOT NULL, -- 购买的积分数量
  payment_method VARCHAR(50) NOT NULL, -- 'alipay', 'wechat', 'stripe', 'paypal'
  payment_provider_order_id VARCHAR(255), -- 第三方订单号
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
  metadata JSONB, -- 支付平台返回的元数据
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Usage Statistics (使用统计)
CREATE TABLE usage_statistics (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id VARCHAR(255) REFERENCES agents(id) ON DELETE SET NULL,
  session_id VARCHAR(255) REFERENCES chat_sessions(id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL, -- 'message', 'workflow_run', 'file_upload'
  credits_used DECIMAL(10, 4) DEFAULT 0,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  model_used VARCHAR(100),
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Data Export Jobs (数据导出任务)
CREATE TABLE export_jobs (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  export_type VARCHAR(50) NOT NULL, -- 'sessions', 'messages', 'agents', 'all'
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  file_path TEXT, -- 导出文件路径
  file_size BIGINT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE -- 文件过期时间
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_files_user ON files(user_id);
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_vectors_file ON knowledge_vectors(file_id);
CREATE INDEX idx_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_workflow_exec_user ON workflow_executions(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_saved_posts_user ON saved_posts(user_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_payment_records_user ON payment_records(user_id);
CREATE INDEX idx_payment_records_status ON payment_records(status);
CREATE INDEX idx_usage_statistics_user ON usage_statistics(user_id);
CREATE INDEX idx_usage_statistics_created ON usage_statistics(created_at);
CREATE INDEX idx_export_jobs_user ON export_jobs(user_id);
`;
