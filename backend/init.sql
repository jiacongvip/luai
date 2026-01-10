-- 数据库初始化脚本
-- 这个脚本会在 PostgreSQL 容器首次启动时自动执行

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 注意：实际的表结构会通过 migrate.ts 脚本创建
-- 这里只做一些基础初始化

