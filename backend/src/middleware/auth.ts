import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// 扩展 Express Request 类型
export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, secret) as { userId: string; email: string; role?: string };
    req.userId = decoded.userId;
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// 可选认证（如果已登录则设置 user，否则继续）
export const optionalAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const secret = process.env.JWT_SECRET;
      if (secret) {
        const decoded = jwt.verify(token, secret) as { userId: string; email: string; role?: string };
        req.userId = decoded.userId;
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
        };
      }
    }
  } catch (error) {
    // 忽略错误，继续执行
  }
  next();
};

// 管理员权限检查
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// 验证Token（用于WebSocket等场景）
export const verifyToken = (token: string): { userId: string; email: string; role?: string } => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  return jwt.verify(token, secret) as { userId: string; email: string; role?: string };
};

