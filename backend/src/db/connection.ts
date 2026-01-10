import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// 获取数据库连接字符串
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  throw new Error('DATABASE_URL is required');
}

// 调试：打印连接信息（隐藏密码）
const urlObj = new URL(databaseUrl);
const maskedUrl = `${urlObj.protocol}//${urlObj.username}:***@${urlObj.hostname}:${urlObj.port}${urlObj.pathname}`;
console.log('🔗 Database connection:', maskedUrl);

// 创建数据库连接池
export const pool = new Pool({
  connectionString: databaseUrl,
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

