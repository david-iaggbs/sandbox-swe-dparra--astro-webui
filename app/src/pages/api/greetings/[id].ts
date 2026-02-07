import type { APIRoute } from 'astro';
import { getApiBackendUrl } from '../../../lib/config';

const BACKEND = getApiBackendUrl();

export const GET: APIRoute = async ({ params }) => {
  const res = await fetch(`${BACKEND}/api/v1/greetings/${params.id}`);
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ params }) => {
  const res = await fetch(`${BACKEND}/api/v1/greetings/${params.id}`, {
    method: 'DELETE',
  });
  return new Response(res.status === 204 ? null : await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
