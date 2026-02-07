import { describe, it, expect } from 'vitest';
import { GET } from './health';

describe('GET /api/health', () => {
  it('returns 200 status', () => {
    const response = GET({} as any);

    expect(response.status).toBe(200);
  });

  it('returns JSON with status UP', async () => {
    const response = GET({} as any);
    const body = await response.json();

    expect(body).toEqual({ status: 'UP' });
  });

  it('has application/json content-type', () => {
    const response = GET({} as any);

    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});
