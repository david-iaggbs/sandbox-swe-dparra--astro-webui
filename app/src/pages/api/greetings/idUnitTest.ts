import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/config', () => ({
  getApiBackendUrl: () => 'http://mock-backend:8080',
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TEST_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('GET /api/greetings/:id', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('proxies GET request with id to backend', async () => {
    const greeting = { id: TEST_ID, name: 'Hello', fullMessage: 'Hello World' };
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(greeting)),
    });

    const { GET } = await import('./[id]');
    const response = await GET({ params: { id: TEST_ID } } as any);

    expect(mockFetch).toHaveBeenCalledWith(
      `http://mock-backend:8080/api/v1/greetings/${TEST_ID}`
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(greeting);
  });

  it('forwards 404 when greeting not found', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      text: () => Promise.resolve('{"message":"Not found"}'),
    });

    const { GET } = await import('./[id]');
    const response = await GET({ params: { id: TEST_ID } } as any);

    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/greetings/:id', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('proxies DELETE request and returns 204 on success', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 204,
      text: () => Promise.resolve(''),
    });

    const { DELETE } = await import('./[id]');
    const response = await DELETE({ params: { id: TEST_ID } } as any);

    expect(mockFetch).toHaveBeenCalledWith(
      `http://mock-backend:8080/api/v1/greetings/${TEST_ID}`,
      { method: 'DELETE' }
    );
    expect(response.status).toBe(204);
  });

  it('returns null body on 204', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 204,
      text: () => Promise.resolve(''),
    });

    const { DELETE } = await import('./[id]');
    const response = await DELETE({ params: { id: TEST_ID } } as any);

    const text = await response.text();
    expect(text).toBe('');
  });

  it('forwards 404 when greeting not found for delete', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      text: () => Promise.resolve('{"message":"Not found"}'),
    });

    const { DELETE } = await import('./[id]');
    const response = await DELETE({ params: { id: TEST_ID } } as any);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Not found' });
  });
});
