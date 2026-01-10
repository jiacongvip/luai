import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// 获取数据库连接字符串
// 优先使用 DATABASE_URL，如果不存在则使用其他 PostgreSQL 环境变量
let databaseUrl = process.env.DATABASE_URL;

// 调试：打印所有相关环境变量（隐藏敏感信息）
console.log('🔍 Database environment variables:');
console.log('  DATABASE_URL:', databaseUrl ? `${databaseUrl.substring(0, 30)}...` : 'NOT SET');
console.log('  PGHOST:', process.env.PGHOST || 'NOT SET');
console.log('  PGPORT:', process.env.PGPORT || 'NOT SET');
console.log('  PGDATABASE:', process.env.PGDATABASE || 'NOT SET');
console.log('  PGUSER:', process.env.PGUSER || 'NOT SET');

if (!databaseUrl) {
  // 如果没有 DATABASE_URL，尝试从其他环境变量构建
  if (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER && process.env.PGPASSWORD) {
    const port = process.env.PGPORT || '5432';
    databaseUrl = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${port}/${process.env.PGDATABASE}`;
    console.log('⚠️  Using PostgreSQL environment variables to build connection string');
  } else {
    console.error('❌ DATABASE_URL environment variable is not set!');
    console.error('❌ Also missing required PostgreSQL environment variables (PGHOST, PGDATABASE, etc.)');
    throw new Error('DATABASE_URL is required');
  }
}

// 调试：打印连接信息（隐藏密码）
try {
  const urlObj = new URL(databaseUrl);
  const maskedUrl = `${urlObj.protocol}//${urlObj.username}:***@${urlObj.hostname}:${urlObj.port}${urlObj.pathname}`;
  console.log('🔗 Database connection:', maskedUrl);
  console.log('🔗 Full connection string length:', databaseUrl.length);
} catch (urlError) {
  console.error('❌ Invalid DATABASE_URL format:', urlError);
  throw new Error(`Invalid DATABASE_URL: ${urlError}`);
}

// 创建数据库连接池
// 明确指定使用 connectionString，避免 pg 库使用其他环境变量
export const pool = new Pool({
  connectionString: databaseUrl,
  // 明确禁用环境变量，强制使用 connectionString
  host: undefined,
  port: undefined,
  database: undefined,
  user: undefined,
  password: undefined,
  // 连接池配置
  max: 20, // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 测试数据库连接
pool.on('connect', () => {
  console.log('✅ Database connected');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// 辅助函数：执行查询
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
};

// 辅助函数：事务执行
export const transaction = async <T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

