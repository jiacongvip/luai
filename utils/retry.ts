// 重试工具函数 - 企业级错误重试机制

/**
 * 使用指数退避策略重试函数
 * @param fn 要重试的函数
 * @param maxRetries 最大重试次数，默认3次
 * @param baseDelay 基础延迟时间（毫秒），默认1000ms
 * @returns Promise<T>
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // 某些错误不应该重试（如 401, 403, 404）
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        throw error;
      }

      // 计算延迟时间：指数退避 (1s, 2s, 4s, ...)
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * 判断错误是否应该重试
 */
export function shouldRetry(error: any): boolean {
  // 网络错误、超时错误、5xx 服务器错误应该重试
  if (!error.status) {
    // 网络错误（fetch 失败）
    return true;
  }
  
  // 5xx 服务器错误应该重试
  if (error.status >= 500 && error.status < 600) {
    return true;
  }
  
  // 429 请求过多应该重试
  if (error.status === 429) {
    return true;
  }
  
  // 408 请求超时应该重试
  if (error.status === 408) {
    return true;
  }
  
  return false;
}

