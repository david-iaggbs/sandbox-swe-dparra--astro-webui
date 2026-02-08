import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/config', () => ({
  getApiBackendUrl: async () => 'http://mock-backend:8080',
  getApiTimeoutMs: async () => 5000,
  getApiRetryCount: async () => 0,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GET /api/greetings', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('proxies GET request to backend and returns greeting list', async () => {
    const greetings = [{ id: '123', name: 'Hello', fullMessage: 'Hello World' }];
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(greetings)),
    });

    const { GET } = await import('./index');
    const response = await GET({} as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://mock-backend:8080/api/v1/greetings',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(greetings);
  });

  it('forwards backend error status', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 500,
      text: () => Promise.resolve('{"message":"Internal error"}'),
    });

    const { GET } = await import('./index');
    const response = await GET({} as any);

    expect(response.status).toBe(500);
  });
});

describe('POST /api/greetings', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('proxies POST request with body to backend', async () => {
    const created = { id: '456', name: 'Morning', fullMessage: 'Good morning!' };
    mockFetch.mockResolvedValueOnce({
      status: 201,
      text: () => Promise.resolve(JSON.stringify(created)),
    });

    const requestBody = JSON.stringify({ name: 'Morning', suffix: 'Good morning!' });
    const mockRequest = new Request('http://localhost/api/greetings', {
      method: 'POST',
      body: requestBody,
      headers: { 'Content-Type': 'application/json' },
    });

    const { POST } = await import('./index');
    const response = await POST({ request: mockRequest } as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://mock-backend:8080/api/v1/greetings',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: expect.any(AbortSignal),
      })
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(created);
  });

  it('forwards 409 conflict from backend', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 409,
      text: () => Promise.resolve('{"message":"Duplicate name"}'),
    });

    const mockRequest = new Request('http://localhost/api/greetings', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup', suffix: 'dup' }),
    });

    const { POST } = await import('./index');
    const response = await POST({ request: mockRequest } as any);

    expect(response.status).toBe(409);
  });
});
