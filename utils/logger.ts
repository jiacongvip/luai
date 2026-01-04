/**
 * 本地日志记录工具
 * 记录所有调试信息、错误、用户操作等到本地文件
 */

interface LogEntry {
  timestamp: string;
  type: 'user_message' | 'ai_response' | 'system' | 'error' | 'debug' | 'api' | 'warning';
  sessionId?: string;
  content: string;
  metadata?: any;
  stack?: string;
}

class Logger {
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 5000; // 最多保存5000条日志
  private readonly STORAGE_KEY = 'nexus_debug_logs';
  private logFile: string = '';
  private originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
  };

  constructor() {
    // 保存原始console方法
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console)
    };

    // 从localStorage加载历史日志
    this.loadLogs();
    
    // 拦截console输出
    this.interceptConsole();
    
    // 拦截全局错误
    this.interceptErrors();
  }

  /**
   * 记录用户消息
   */
  logUserMessage(sessionId: string, content: string, metadata?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'user_message',
      sessionId,
      content,
      metadata
    };
    this.addLog(entry);
    this.saveLogs();
  }

  /**
   * 记录AI回复
   */
  logAIResponse(sessionId: string, content: string, metadata?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'ai_response',
      sessionId,
      content,
      metadata
    };
    this.addLog(entry);
    this.saveLogs();
  }

  /**
   * 记录系统事件
   */
  logSystem(sessionId: string, content: string, metadata?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'system',
      sessionId,
      content,
      metadata
    };
    this.addLog(entry);
    this.saveLogs();
  }

  /**
   * 记录错误
   */
  logError(sessionId: string | undefined, error: string, metadata?: any, stack?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'error',
      sessionId,
      content: error,
      metadata,
      stack
    };
    this.addLog(entry);
    this.saveLogs();
  }

  /**
   * 记录调试信息
   */
  logDebug(content: string, metadata?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'debug',
      content,
      metadata
    };
    this.addLog(entry);
    this.saveLogs();
  }

  /**
   * 记录API调用
   */
  logAPI(method: string, url: string, status?: number, error?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'api',
      content: `${method} ${url} ${status ? `[${status}]` : ''} ${error || ''}`,
      metadata: { method, url, status, error }
    };
    this.addLog(entry);
    this.saveLogs();
  }

  /**
   * 记录警告
   */
  logWarning(content: string, metadata?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'warning',
      content,
      metadata
    };
    this.addLog(entry);
    this.saveLogs();
  }

  /**
   * 拦截console输出
   */
  private interceptConsole() {
    // 拦截 console.log
    console.log = (...args: any[]) => {
      this.originalConsole.log(...args);
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      this.logDebug(message, { source: 'console.log' });
    };

    // 拦截 console.error
    console.error = (...args: any[]) => {
      this.originalConsole.error(...args);
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      const stack = new Error().stack;
      this.logError(undefined, message, { source: 'console.error' }, stack);
    };

    // 拦截 console.warn
    console.warn = (...args: any[]) => {
      this.originalConsole.warn(...args);
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      this.logWarning(message, { source: 'console.warn' });
    };

    // 拦截 console.info
    console.info = (...args: any[]) => {
      this.originalConsole.info(...args);
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      this.logDebug(message, { source: 'console.info' });
    };
  }

  /**
   * 拦截全局错误
   */
  private interceptErrors() {
    // 拦截未捕获的错误
    window.addEventListener('error', (event) => {
      this.logError(
        undefined,
        `Uncaught Error: ${event.message}`,
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          source: 'window.error'
        },
        event.error?.stack
      );
    });

    // 拦截未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      this.logError(
        undefined,
        `Unhandled Promise Rejection: ${message}`,
        { source: 'unhandledrejection' },
        stack
      );
    });
  }

  /**
   * 添加日志条目
   */
  private addLog(entry: LogEntry) {
    this.logs.push(entry);
    // 如果超过最大数量，删除最旧的日志
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }
  }

  /**
   * 保存日志到localStorage
   */
  private saveLogs() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.logs));
    } catch (e) {
      console.error('Failed to save logs to localStorage:', e);
    }
  }

  /**
   * 从localStorage加载日志
   */
  private loadLogs() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load logs from localStorage:', e);
      this.logs = [];
    }
  }

  /**
   * 获取所有日志
   */
  getAllLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * 获取指定会话的日志
   */
  getSessionLogs(sessionId: string): LogEntry[] {
    return this.logs.filter(log => log.sessionId === sessionId);
  }

  /**
   * 导出日志为JSON文件
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * 导出日志为文本文件
   */
  exportLogsAsText(): string {
    return this.logs.map(log => {
      const date = new Date(log.timestamp).toLocaleString('zh-CN');
      const sessionInfo = log.sessionId ? `[${log.sessionId}]` : '[N/A]';
      let output = `[${date}] [${log.type.toUpperCase()}] ${sessionInfo}\n${log.content}\n`;
      if (log.metadata) {
        output += `Metadata: ${JSON.stringify(log.metadata, null, 2)}\n`;
      }
      if (log.stack) {
        output += `Stack:\n${log.stack}\n`;
      }
      output += '---\n';
      return output;
    }).join('\n');
  }

  /**
   * 获取日志文件路径（用于显示）
   */
  getLogFilePath(): string {
    return `nexus_debug_logs_${new Date().toISOString().split('T')[0]}.txt`;
  }

  /**
   * 清空日志
   */
  clearLogs() {
    this.logs = [];
    this.saveLogs();
  }

  /**
   * 下载日志文件
   */
  downloadLogs(format: 'json' | 'text' = 'json') {
    const content = format === 'json' ? this.exportLogs() : this.exportLogsAsText();
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus_chat_logs_${new Date().toISOString().split('T')[0]}.${format === 'json' ? 'json' : 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// 导出单例
export const logger = new Logger();

