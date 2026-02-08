import type { APIRoute } from 'astro';
import { loadDescription, getApiBackendUrl } from '../../lib/config';

export const GET: APIRoute = async () => {
  const [description, apiBackendUrl] = await Promise.all([loadDescription(), getApiBackendUrl()]);
  return new Response(JSON.stringify({ description, apiBackendUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
