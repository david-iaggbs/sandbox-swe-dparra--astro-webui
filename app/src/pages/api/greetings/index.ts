import type { APIRoute } from 'astro';
import { getApiBackendUrl } from '../../../lib/config';

const BACKEND = getApiBackendUrl();

export const GET: APIRoute = async () => {
  const res = await fetch(`${BACKEND}/api/v1/greetings`);
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const res = await fetch(`${BACKEND}/api/v1/greetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
