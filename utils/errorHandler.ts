// 错误处理工具 - 企业级错误处理和用户提示

export interface ErrorContext {
  action: string;
  component?: string;
  userId?: string;
  sessionId?: string;
}

/**
 * 处理错误并显示用户友好的提示
 */
export function handleError(error: Error | any, context: ErrorContext): void {
  const errorMessage = error?.message || error?.error || 'Unknown error';
  const errorStatus = error?.status || error?.response?.status;

  console.error(`[${context.component || 'App'}] ${context.action} error:`, error);

  // 根据错误类型显示不同的提示
  let userMessage = '操作失败，请稍后重试';

  if (!errorStatus) {
    // 网络错误
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      userMessage = '网络连接失败，请检查网络后重试';
    } else if (errorMessage.includes('timeout')) {
      userMessage = '请求超时，请稍后重试';
    }
  } else {
    switch (errorStatus) {
      case 401:
        userMessage = '登录已过期，请重新登录';
        // 可以在这里触发登出逻辑
        break;
      case 403:
        userMessage = '没有权限执行此操作';
        break;
      case 404:
        userMessage = '请求的资源不存在';
        break;
      case 429:
        userMessage = '请求过于频繁，请稍后再试';
        break;
      case 500:
      case 502:
      case 503:
        userMessage = '服务器错误，请稍后重试';
        break;
      default:
        userMessage = `操作失败 (${errorStatus})`;
    }
  }

  // 显示错误提示（可以使用 toast 库，这里先用 alert）
  if (typeof window !== 'undefined') {
    // 优先使用自定义的 toast 系统，如果没有则使用 alert
    const showToast = (window as any).showToast;
    if (showToast) {
      showToast(userMessage, 'error');
    } else {
      alert(userMessage);
    }
  }

  // 生产环境发送错误日志到监控系统
  if (process.env.NODE_ENV === 'production') {
    logError(error, context);
  }
}

/**
 * 记录错误日志（可以发送到 Sentry、LogRocket 等）
 */
function logError(error: Error | any, context: ErrorContext): void {
  // TODO: 集成错误监控服务（如 Sentry）
  // Sentry.captureException(error, {
  //   tags: {
  //     component: context.component,
  //     action: context.action,
  //   },
  //   extra: {
  //     userId: context.userId,
  //     sessionId: context.sessionId,
  //   },
  // });
  
  // 暂时只记录到控制台
  console.error('Error logged:', {
    error: error?.message || error,
    context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 解析 SSE 数据块
 */
export function parseSSEChunk(data: Uint8Array): { type: string; content?: string; messageId?: string; error?: string } | null {
  try {
    const text = new TextDecoder().decode(data);
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.substring(6);
        if (jsonStr.trim()) {
          return JSON.parse(jsonStr);
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to parse SSE chunk:', error);
    return null;
  }
}

