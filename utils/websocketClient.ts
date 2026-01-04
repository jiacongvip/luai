/**
 * WebSocket 客户端
 * 提供类似 ChatGPT、Claude 的实时双向通信
 */

// 获取认证token
const getToken = (): string | null => {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
};

interface WebSocketMessage {
  type: 'connected' | 'chunk' | 'message_start' | 'message_done' | 'error' | 'pong';
  messageId?: string;
  content?: string;
  agentId?: string;
  agentName?: string;
  error?: string;
  chunkCount?: number;
  timestamp?: number;
}

type MessageHandler = (message: WebSocketMessage) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Set<MessageHandler> = new Set();
  private isConnecting = false;

  constructor() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.VITE_WS_URL || window.location.host.replace(':4000', ':3001');
    this.url = `${wsProtocol}//${wsHost}/ws`;
  }

  /**
   * 连接WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
        resolve();
        return;
      }

      this.isConnecting = true;
      const token = getToken();
      
      if (!token) {
        reject(new Error('No authentication token'));
        this.isConnecting = false;
        return;
      }

      const wsUrl = `${this.url}?token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.isConnecting = false;
        this.ws = null;
        
        // 自动重连
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => {
            this.connect().catch(console.error);
          }, this.reconnectDelay * this.reconnectAttempts);
        }
      };
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
  }

  /**
   * 发送消息
   */
  sendMessage(data: {
    sessionId: string;
    content: string;
    agentId?: string;
    modelOverride?: string;
    contextData?: any;
  }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.ws.send(JSON.stringify({
      type: 'send_message',
      data
    }));
  }

  /**
   * 取消消息生成
   */
  cancel(messageId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'cancel',
      messageId
    }));
  }

  /**
   * 添加消息处理器
   */
  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(message: WebSocketMessage) {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error('Message handler error:', error);
      }
    }
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// 导出单例
export const websocketClient = new WebSocketClient();

