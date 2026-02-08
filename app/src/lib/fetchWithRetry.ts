import { getApiTimeoutMs, getApiRetryCount } from './config';

export async function fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
  const [timeoutMs, retryCount] = await Promise.all([getApiTimeoutMs(), getApiRetryCount()]);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
