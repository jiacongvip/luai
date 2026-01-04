/**
 * WebSocket 服务
 * 提供双向实时通信，类似 ChatGPT、Claude 等大公司的实现
 */

import { WebSocket, WebSocketServer } from 'ws';
import { query } from '../db/connection.js';
import { generateChatStream } from './apiService.js';
import jwt from 'jsonwebtoken';

// 验证Token（用于WebSocket）
const verifyToken = (token: string): { userId: string; email: string; role?: string } => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  return jwt.verify(token, secret) as { userId: string; email: string; role?: string };
};

interface WebSocketClient {
  ws: WebSocket;
  userId: string;
  sessionId?: string;
  lastPing: number;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  /**
   * 初始化 WebSocket 服务器
   */
  initialize(server: any) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      perMessageDeflate: false // 禁用压缩，减少延迟
    });

    this.wss.on('connection', (ws: WebSocket, req: any) => {
      this.handleConnection(ws, req);
    });

    // 心跳检测（每30秒）
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000);

    console.log('✅ WebSocket server initialized on /ws');
  }

  /**
   * 处理新连接
   */
  private async handleConnection(ws: WebSocket, req: any) {
    const clientId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // 从查询参数或headers获取token
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      ws.close(1008, 'Authentication required');
      return;
    }

    try {
      const decoded = verifyToken(token);
      const userId = decoded.userId;

      const client: WebSocketClient = {
        ws,
        userId,
        lastPing: Date.now()
      };

      this.clients.set(clientId, client);

      // 发送连接成功消息
      this.send(clientId, {
        type: 'connected',
        clientId,
        timestamp: Date.now()
      });

      // 处理消息
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(clientId, message);
        } catch (error: any) {
          console.error('WebSocket message error:', error);
          this.sendError(clientId, 'Invalid message format');
        }
      });

      // 处理关闭
      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`🔌 WebSocket client disconnected: ${clientId}`);
      });

      // 处理错误
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(clientId);
      });

      // 处理pong响应
      ws.on('pong', () => {
        const client = this.clients.get(clientId);
        if (client) {
          client.lastPing = Date.now();
        }
      });

      console.log(`✅ WebSocket client connected: ${clientId} (user: ${userId})`);
    } catch (error: any) {
      console.error('WebSocket authentication error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  /**
   * 处理客户端消息
   */
  private async handleMessage(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'ping':
        this.send(clientId, { type: 'pong', timestamp: Date.now() });
        break;

      case 'send_message':
        await this.handleSendMessage(clientId, message.data);
        break;

      case 'cancel':
        // 取消当前生成（如果需要）
        this.send(clientId, { type: 'cancelled', messageId: message.messageId });
        break;

      default:
        this.sendError(clientId, `Unknown message type: ${message.type}`);
    }
  }

  /**
   * 处理发送消息请求
   */
  private async handleSendMessage(clientId: string, data: any) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { sessionId, content, agentId, modelOverride, contextData } = data;

    if (!sessionId || !content) {
      this.sendError(clientId, 'Session ID and content are required');
      return;
    }

    try {
      // 验证会话
      const sessionResult = await query(
        'SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, client.userId]
      );

      if (sessionResult.rows.length === 0) {
        this.sendError(clientId, 'Session not found');
        return;
      }

      const session = sessionResult.rows[0];

      // 获取 Agent 信息
      let systemPrompt = 'You are a helpful AI assistant.';
      let agentName = 'Nexus';

      if (agentId) {
        const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
        if (agentResult.rows.length > 0) {
          const agent = agentResult.rows[0];
          systemPrompt = agent.system_prompt;
          agentName = agent.name;
        }
      }

      // 保存用户消息
      const userMessageId = `m${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      await query(
        `INSERT INTO messages (id, session_id, type, content, sender_id, sender_name, timestamp)
         VALUES ($1, $2, 'USER', $3, $4, $5, $6)`,
        [userMessageId, sessionId, content, client.userId, 'User', Date.now().toString()]
      );

      // 更新会话
      await query(
        'UPDATE chat_sessions SET last_message = $1, updated_at = NOW() WHERE id = $2',
        [content.substring(0, 100), sessionId]
      );

      // 发送开始信号
      const aiMessageId = `m${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      this.send(clientId, {
        type: 'message_start',
        messageId: aiMessageId,
        agentId: agentId || 'a1',
        agentName
      });

      // 构建上下文
      let contextPrompt = '';
      if (contextData) {
        contextPrompt = `\n\n[[CURRENT PROJECT CONTEXT]]\n${JSON.stringify(contextData, null, 2)}\n[[END CONTEXT]]\n\n`;
      }

      // 获取用户偏好
      const userPrefsResult = await query('SELECT preferences FROM users WHERE id = $1', [client.userId]);
      let userPreferences = null;
      if (userPrefsResult.rows[0]?.preferences) {
        try {
          userPreferences = typeof userPrefsResult.rows[0].preferences === 'string' 
            ? JSON.parse(userPrefsResult.rows[0].preferences) 
            : userPrefsResult.rows[0].preferences;
        } catch (e) {
          userPreferences = null;
        }
      }

      // 流式生成AI响应
      let fullResponse = '';
      let chunkCount = 0;

      try {
        for await (const chunk of generateChatStream(
          contextPrompt + content,
          systemPrompt,
          modelOverride,
          userPreferences,
          contextData?._successful_examples_
        )) {
          chunkCount++;
          fullResponse += chunk;
          
          // 立即发送chunk（WebSocket比SSE更实时）
          this.send(clientId, {
            type: 'chunk',
            messageId: aiMessageId,
            content: chunk
          });
        }

        // 保存AI响应
        await query(
          `INSERT INTO messages (id, session_id, type, content, sender_id, sender_name, timestamp, related_agent_id)
           VALUES ($1, $2, 'AGENT', $3, $4, $5, $6, $7)`,
          [
            aiMessageId,
            sessionId,
            fullResponse,
            agentId || 'a1',
            agentName,
            Date.now().toString(),
            agentId || 'a1',
          ]
        );

        // 发送完成信号
        this.send(clientId, {
          type: 'message_done',
          messageId: aiMessageId,
          content: fullResponse,
          chunkCount
        });

        console.log(`✅ WebSocket message completed: ${chunkCount} chunks, ${fullResponse.length} chars`);
      } catch (error: any) {
        console.error('WebSocket AI generation error:', error);
        this.sendError(clientId, `AI generation failed: ${error.message}`);
      }
    } catch (error: any) {
      console.error('WebSocket send message error:', error);
      this.sendError(clientId, `Failed to send message: ${error.message}`);
    }
  }

  /**
   * 发送消息给客户端
   */
  private send(clientId: string, data: any) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(data));
      } catch (error) {
        console.error('WebSocket send error:', error);
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * 发送错误消息
   */
  private sendError(clientId: string, error: string) {
    this.send(clientId, {
      type: 'error',
      error,
      timestamp: Date.now()
    });
  }

  /**
   * 心跳检测
   */
  private pingClients() {
    const now = Date.now();
    const timeout = 60000; // 60秒超时

    for (const [clientId, client] of this.clients.entries()) {
      if (now - client.lastPing > timeout) {
        console.log(`⏱️ WebSocket client timeout: ${clientId}`);
        client.ws.terminate();
        this.clients.delete(clientId);
      } else {
        // 发送ping
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }
  }

  /**
   * 关闭所有连接
   */
  close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
    }
  }
}

export const websocketService = new WebSocketService();

