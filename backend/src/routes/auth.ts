import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// 注册
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // 检查用户是否已存在
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 生成用户 ID
    const userId = `u${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // 创建用户
    await query(
      `INSERT INTO users (id, email, name, password_hash, credits, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [userId, email, name, passwordHash, 500.0, 'user', 'active']
    );

    // 生成 JWT
    const token = jwt.sign(
      { userId, email, role: 'user' },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: userId,
        email,
        name,
        credits: 500.0,
        role: 'user',
        status: 'active',
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // 查找用户
    const result = await query(
      'SELECT id, email, name, password_hash, credits, role, status FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // 验证密码
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 更新最后登录时间
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // 生成 JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        credits: parseFloat(user.credits),
        role: user.role,
        status: user.status,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// 注意：/me 路由已移至 /api/users/me，这里保留是为了兼容性
// 但建议使用 /api/users/me

export default router;

