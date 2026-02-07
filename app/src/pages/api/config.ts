import type { APIRoute } from 'astro';
import { loadDescription, getApiBackendUrl } from '../../lib/config';

export const GET: APIRoute = async () => {
  const description = await loadDescription();
  return new Response(JSON.stringify({ description, apiBackendUrl: getApiBackendUrl() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
