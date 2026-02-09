import type { APIRoute } from 'astro';
import { getApiBackendUrl } from '../../../lib/config';
import { fetchWithRetry } from '../../../lib/fetchWithRetry';
import logger from '../../../lib/logger';

export const GET: APIRoute = async () => {
  try {
    const backendUrl = await getApiBackendUrl();
    const res = await fetchWithRetry(`${backendUrl}/api/v1/greetings`);
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error({ err }, 'GET /api/greetings failed');
    return new Response(JSON.stringify({ message: 'Service temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
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
  } catch (err) {
    logger.error({ err }, 'POST /api/greetings failed');
    return new Response(JSON.stringify({ message: 'Service temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
