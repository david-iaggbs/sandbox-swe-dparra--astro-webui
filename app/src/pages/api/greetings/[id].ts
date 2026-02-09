import type { APIRoute } from 'astro';
import { getApiBackendUrl } from '../../../lib/config';
import { fetchWithRetry } from '../../../lib/fetchWithRetry';
import logger from '../../../lib/logger';

export const GET: APIRoute = async ({ params }) => {
  try {
    const backendUrl = await getApiBackendUrl();
    const res = await fetchWithRetry(`${backendUrl}/api/v1/greetings/${params.id}`);
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error({ err, greetingId: params.id }, 'GET /api/greetings/:id failed');
    return new Response(JSON.stringify({ message: 'Service temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const backendUrl = await getApiBackendUrl();
    const res = await fetchWithRetry(`${backendUrl}/api/v1/greetings/${params.id}`, {
      method: 'DELETE',
    });
    return new Response(res.status === 204 ? null : await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error({ err, greetingId: params.id }, 'DELETE /api/greetings/:id failed');
    return new Response(JSON.stringify({ message: 'Service temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
