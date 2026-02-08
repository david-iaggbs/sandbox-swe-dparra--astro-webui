import type { APIRoute } from 'astro';
import { getApiBackendUrl, getApiTimeoutMs, getApiRetryCount } from '../../../lib/config';

async function fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
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

export const GET: APIRoute = async () => {
  const backendUrl = await getApiBackendUrl();
  const res = await fetchWithRetry(`${backendUrl}/api/v1/greetings`);
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const backendUrl = await getApiBackendUrl();
  const body = await request.text();
  const res = await fetchWithRetry(`${backendUrl}/api/v1/greetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
