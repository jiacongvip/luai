import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// SSE 自检：用于排查“是否被代理缓冲/浏览器无法读取流/后端未及时flush”等问题
router.get('/sse', authenticate, async (req: AuthRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (res.socket) {
    res.socket.setNoDelay(true);
  }

  res.flushHeaders();
  res.write(':\n\n'); // 立即发送一个注释帧，避免中间层等待首包

  const count = Math.min(Number(req.query.count ?? 20), 200);
  const intervalMs = Math.max(Number(req.query.intervalMs ?? 100), 10);

  const writeEvent = (payload: any) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  writeEvent({ type: 'start', timestamp: Date.now() });

  let index = 0;
  const timer = setInterval(() => {
    index += 1;
    writeEvent({ type: 'chunk', content: `tick-${index}`, index, timestamp: Date.now() });

    if (index >= count) {
      clearInterval(timer);
      writeEvent({ type: 'done', timestamp: Date.now() });
      res.end();
    }
  }, intervalMs);

  req.on('close', () => {
    clearInterval(timer);
  });
});

export default router;

