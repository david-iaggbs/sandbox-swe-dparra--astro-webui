import { getApiTimeoutMs, getApiRetryCount } from './config';
import logger from './logger';

export async function fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
  const [timeoutMs, retryCount] = await Promise.all([getApiTimeoutMs(), getApiRetryCount()]);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (attempt > 0) {
        logger.info({ url, attempt, status: response.status }, 'Fetch succeeded after retry');
      }
      return response;
    } catch (error) {
      lastError = error;
      logger.warn({ url, attempt, retryCount, err: error }, 'Fetch attempt failed');
    }
  }
  logger.error({ url, retryCount, err: lastError }, 'All fetch attempts exhausted');
  throw lastError;
}
