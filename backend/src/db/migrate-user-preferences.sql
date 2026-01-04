-- 迁移用户偏好设置字段类型
-- 将 users.preferences 从 TEXT 改为 JSONB，以支持结构化的UI设置存储

-- 1. 备份现有 preferences 数据
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences_backup TEXT;
UPDATE users SET preferences_backup = preferences WHERE preferences IS NOT NULL;

-- 2. 修改 preferences 列类型为 JSONB
ALTER TABLE users ALTER COLUMN preferences TYPE JSONB USING 
  CASE 
    WHEN preferences IS NULL THEN '{}'::jsonb
    WHEN preferences = '' THEN '{}'::jsonb
    ELSE jsonb_build_object('userInstructions', preferences)
  END;

-- 3. 设置默认值
ALTER TABLE users ALTER COLUMN preferences SET DEFAULT '{}'::jsonb;

-- 4. 为 preferences 添加注释
COMMENT ON COLUMN users.preferences IS 'User UI preferences and settings (theme, language, feature flags, etc.) stored as JSONB';

-- 示例数据结构：
-- {
--   "theme": "blue",
--   "mode": "dark",
--   "language": "zh",
--   "modelName": "gemini-3-flash-preview",
--   "featureFlags": {
--     "showContextDrawer": true,
--     "showThoughtChain": true,
--     "showFollowUps": true,
--     "showRichActions": true,
--     "showTrendAnalysis": true,
--     "showSimulator": true,
--     "enableStylePrompt": true,
--     "showGoalLanding": false,
--     "enableWebSocket": false,
--     "allowModelSelect": true
--   },
--   "userInstructions": "Always prefer concise answers..." -- 原有的 preferences 文本
-- }

