-- 添加交互式选项字段到 messages 表
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS interactive_options JSONB;

-- 添加注释
COMMENT ON COLUMN messages.interactive_options IS '交互式选项（用于信息收集时的选项按钮）';

