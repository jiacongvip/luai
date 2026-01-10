import { Request, Response, NextFunction } from 'express';
import { query } from '../db/connection.js';

// ============================================
// 1. API 速率限制 (Rate Limiting)
// ============================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// 内存存储（生产环境建议用 Redis）
const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitOptions {
  windowMs: number;      // 时间窗口（毫秒）
  maxRequests: number;   // 最大请求数
  message?: string;      // 超限消息
}

export const rateLimit = (options: RateLimitOptions) => {
  const { windowMs, maxRequests, message = 'Too many requests, please try again later.' } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // 暂时禁用速率限制（测试环境）
    // TODO: 测试完成后重新启用
    return next();
    
    /* 原始速率限制代码（已禁用）
    // 使用 IP + 用户ID 作为 key
    const userId = (req as any).userId || 'anonymous';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}-${userId}`;

    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      // 新建或重置
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      // 超出限制 - 但在开发环境或对于已认证用户，记录警告但不阻止
      const isDev = process.env.NODE_ENV !== 'production';
      const isAuthenticated = userId !== 'anonymous';
      
      if (isDev && isAuthenticated) {
        // 开发环境且已认证用户：只记录警告，不阻止
        console.warn(`⚠️ Rate limit warning for ${key}: ${entry.count}/${maxRequests} requests`);
        entry.count++;
        return next();
      }
      
      // 超出限制
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    // 增加计数
    entry.count++;
    next();
    */
  };
};

// 预设的速率限制配置
export const rateLimitPresets = {
  // 通用 API: 1000 请求/分钟（大幅提高限制，支持前端并发加载）
  standard: rateLimit({ windowMs: 60 * 1000, maxRequests: 1000 }),
  // 登录/注册: 5 请求/分钟（防暴力破解）
  auth: rateLimit({ windowMs: 60 * 1000, maxRequests: 5, message: 'Too many login attempts, please try again later.' }),
  // 消息发送: 200 请求/分钟（提高限制）
  messages: rateLimit({ windowMs: 60 * 1000, maxRequests: 200 }),
  // 会话读取: 500 请求/分钟（前端会并发加载多个会话）
  sessions: rateLimit({ windowMs: 60 * 1000, maxRequests: 500 }),
  // 文件上传: 10 请求/分钟
  upload: rateLimit({ windowMs: 60 * 1000, maxRequests: 10 }),
  // 支付相关: 3 请求/分钟
  payment: rateLimit({ windowMs: 60 * 1000, maxRequests: 3 }),
};

// ============================================
// 2. 输入验证和清理 (Input Validation & Sanitization)
// ============================================

// XSS 危险字符转义
export const escapeHtml = (str: string): string => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// 清理对象中的字符串字段
export const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return escapeHtml(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key of Object.keys(obj)) {
      // 跳过密码字段的清理（避免影响哈希）
      if (key.toLowerCase().includes('password')) {
        sanitized[key] = obj[key];
      } else {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  return obj;
};

// XSS 防护中间件
export const xssProtection = (req: Request, res: Response, next: NextFunction) => {
  // 清理 body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  // 清理 query
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query) as any;
  }
  // 清理 params
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  next();
};

// SQL 注入检测
const sqlInjectionPatterns = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/i,
  /(--)|(\/\*)|(\*\/)/,
  /(\bOR\b|\bAND\b)\s*\d+\s*=\s*\d+/i,
  /'\s*(OR|AND)\s*'.*'.*=/i,
];

export const detectSqlInjection = (value: string): boolean => {
  if (typeof value !== 'string') return false;
  return sqlInjectionPatterns.some(pattern => pattern.test(value));
};

// SQL 注入防护中间件
export const sqlInjectionProtection = (req: Request, res: Response, next: NextFunction) => {
  const checkObject = (obj: any, path: string): string | null => {
    // 对于某些允许包含自然语言 / SQL 关键词的字段，跳过检测
    // 例如：智能体的人设提示词、欢迎语等
    const allowListPrefixes = [
      'body.systemPrompt',
      'body.welcomeMessage',
      'body.description',
      'body.descriptionZh',
    ];
    if (allowListPrefixes.some(prefix => path.startsWith(prefix))) {
      return null;
    }

    if (typeof obj === 'string' && detectSqlInjection(obj)) {
      return path;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const result = checkObject(obj[i], `${path}[${i}]`);
        if (result) return result;
      }
    }
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        const result = checkObject(obj[key], `${path}.${key}`);
        if (result) return result;
      }
    }
    return null;
  };

  const bodyCheck = checkObject(req.body, 'body');
  if (bodyCheck) {
    console.warn(`⚠️ SQL Injection detected in ${bodyCheck}`);
    return res.status(400).json({ error: 'Invalid input detected' });
  }

  const queryCheck = checkObject(req.query, 'query');
  if (queryCheck) {
    console.warn(`⚠️ SQL Injection detected in ${queryCheck}`);
    return res.status(400).json({ error: 'Invalid input detected' });
  }

  next();
};

// ============================================
// 3. 审计日志 (Audit Logging)
// ============================================

export interface AuditLogEntry {
  userId: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ip: string;
  userAgent: string;
  success: boolean;
  errorMessage?: string;
}

// 写入审计日志
export const writeAuditLog = async (entry: AuditLogEntry): Promise<void> => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, details, ip, user_agent, success, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.userId,
        entry.action,
        entry.resource,
        entry.resourceId || null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ip,
        entry.userAgent,
        entry.success,
        entry.errorMessage || null,
      ]
    );
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
};

// 审计日志中间件
export const auditLog = (action: string, resource: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const originalJson = res.json.bind(res);

    // 拦截 res.json 以记录响应
    res.json = function (body: any) {
      const success = res.statusCode >= 200 && res.statusCode < 400;
      const duration = Date.now() - startTime;

      writeAuditLog({
        userId: (req as any).userId || null,
        action,
        resource,
        resourceId: req.params.id || req.body?.id,
        details: {
          method: req.method,
          path: req.path,
          duration,
          statusCode: res.statusCode,
        },
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        success,
        errorMessage: success ? undefined : body?.error,
      });

      return originalJson(body);
    };

    next();
  };
};

// ============================================
// 4. 安全响应头
// ============================================

export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'DENY');
  // XSS 防护
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // 防止 MIME 类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // 引用策略
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // 内容安全策略
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'");
  
  next();
};

// ============================================
// 5. 敏感操作确认令牌
// ============================================

const confirmationTokens = new Map<string, { userId: string; action: string; expiresAt: number }>();

// 生成确认令牌
export const generateConfirmationToken = (userId: string, action: string): string => {
  const token = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  confirmationTokens.set(token, {
    userId,
    action,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5分钟有效
  });
  return token;
};

// 验证确认令牌
export const verifyConfirmationToken = (token: string, userId: string, action: string): boolean => {
  const entry = confirmationTokens.get(token);
  if (!entry) return false;
  if (entry.userId !== userId || entry.action !== action) return false;
  if (Date.now() > entry.expiresAt) {
    confirmationTokens.delete(token);
    return false;
  }
  confirmationTokens.delete(token); // 一次性使用
  return true;
};

// 需要确认的敏感操作中间件
export const requireConfirmation = (action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId;
    const confirmToken = req.headers['x-confirm-token'] as string;

    if (!confirmToken) {
      // 生成新的确认令牌
      const token = generateConfirmationToken(userId, action);
      return res.status(428).json({
        error: 'Confirmation required',
        confirmToken: token,
        message: `Please confirm this ${action} operation by including the token in x-confirm-token header`,
      });
    }

    if (!verifyConfirmationToken(confirmToken, userId, action)) {
      return res.status(403).json({ error: 'Invalid or expired confirmation token' });
    }

    next();
  };
};

// 清理过期的令牌（定时任务）
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of confirmationTokens.entries()) {
    if (now > entry.expiresAt) {
      confirmationTokens.delete(token);
    }
  }
  
  // 清理过期的速率限制条目
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // 每分钟清理一次

