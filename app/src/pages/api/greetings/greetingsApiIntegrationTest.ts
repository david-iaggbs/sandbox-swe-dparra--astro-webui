import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for the Greetings API proxy layer.
 * The external backend (spring-cloud-service) is mocked via fetch.
 * The SSM client is mocked to return fallback defaults (no AWS in CI).
 * The config module, API route handlers, and request/response pipeline
 * are exercised as a whole.
 */

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = vi.fn().mockRejectedValue(new Error('SSM not available in test'));
  },
  GetParameterCommand: class {
    constructor(public input: any) {}
  },
}));

vi.mock('../../../lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  initLogLevel: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const GREETING_UUID = '550e8400-e29b-41d4-a716-446655440000';
const GREETING_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';

function backendResponse(status: number, body?: object) {
  return {
    status,
    text: () => Promise.resolve(body ? JSON.stringify(body) : ''),
  };
}

function greetingPayload(id: string, name: string, suffix: string) {
  return {
    id,
    name,
    suffix,
    fullMessage: `${name}, ${suffix}`,
    clientIp: '127.0.0.1',
    userAgent: 'test',
    createdAt: '2026-02-07T10:00:00Z',
    updatedAt: '2026-02-07T10:00:00Z',
  };
}

describe('Greetings API Integration', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Create → List → Lookup → Delete flow', () => {
    it('creates a greeting and returns 201 with the created resource', async () => {
      const created = greetingPayload(GREETING_UUID, 'Morning', 'Good morning!');
      mockFetch.mockResolvedValueOnce(backendResponse(201, created));

      const { POST } = await import('./index');
      const request = new Request('http://localhost:4321/api/greetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Morning', suffix: 'Good morning!' }),
      });
      const response = await POST({ request } as any);

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.id).toBe(GREETING_UUID);
      expect(body.name).toBe('Morning');
      expect(body.fullMessage).toBe('Morning, Good morning!');
    });

    it('lists all greetings including the created one', async () => {
      const greetings = [
        greetingPayload(GREETING_UUID, 'Morning', 'Good morning!'),
        greetingPayload(GREETING_UUID_2, 'Evening', 'Good evening!'),
      ];
      mockFetch.mockResolvedValueOnce(backendResponse(200, greetings));

      const { GET } = await import('./index');
      const response = await GET({} as any);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe('Morning');
      expect(body[1].name).toBe('Evening');
    });

    it('looks up a specific greeting by ID', async () => {
      const greeting = greetingPayload(GREETING_UUID, 'Morning', 'Good morning!');
      mockFetch.mockResolvedValueOnce(backendResponse(200, greeting));

      const { GET } = await import('./[id]');
      const response = await GET({ params: { id: GREETING_UUID } } as any);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.id).toBe(GREETING_UUID);
      expect(body.fullMessage).toBe('Morning, Good morning!');
    });

    it('deletes a greeting and returns 204', async () => {
      mockFetch.mockResolvedValueOnce(backendResponse(204));

      const { DELETE } = await import('./[id]');
      const response = await DELETE({ params: { id: GREETING_UUID } } as any);

      expect(response.status).toBe(204);
      const text = await response.text();
      expect(text).toBe('');
    });
  });

  describe('Error scenarios', () => {
    it('returns 409 when creating a greeting with a duplicate name', async () => {
      const error = { message: 'Greeting with name "Morning" already exists', status: 409 };
      mockFetch.mockResolvedValueOnce(backendResponse(409, error));

      const { POST } = await import('./index');
      const request = new Request('http://localhost:4321/api/greetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Morning', suffix: 'Good morning!' }),
      });
      const response = await POST({ request } as any);

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.message).toContain('already exists');
    });

    it('returns 400 when creating a greeting with invalid data', async () => {
      const error = { message: 'Validation failed: name must not be blank', status: 400 };
      mockFetch.mockResolvedValueOnce(backendResponse(400, error));

      const { POST } = await import('./index');
      const request = new Request('http://localhost:4321/api/greetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', suffix: '' }),
      });
      const response = await POST({ request } as any);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toContain('Validation failed');
    });

    it('returns 404 when looking up a non-existent greeting', async () => {
      const error = { message: 'Greeting not found', status: 404 };
      mockFetch.mockResolvedValueOnce(backendResponse(404, error));

      const { GET } = await import('./[id]');
      const response = await GET({ params: { id: 'non-existent-id' } } as any);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.message).toBe('Greeting not found');
    });

    it('returns 404 when deleting a non-existent greeting', async () => {
      const error = { message: 'Greeting not found', status: 404 };
      mockFetch.mockResolvedValueOnce(backendResponse(404, error));

      const { DELETE } = await import('./[id]');
      const response = await DELETE({ params: { id: 'non-existent-id' } } as any);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.message).toBe('Greeting not found');
    });

    it('returns 200 with empty array when no greetings exist', async () => {
      mockFetch.mockResolvedValueOnce(backendResponse(200, []));

      const { GET } = await import('./index');
      const response = await GET({} as any);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual([]);
    });

    it('forwards 500 when backend is unavailable', async () => {
      mockFetch.mockResolvedValueOnce(backendResponse(500, {
        message: 'Internal Server Error',
        status: 500,
      }));

      const { GET } = await import('./index');
      const response = await GET({} as any);

      expect(response.status).toBe(500);
    });
  });

  describe('Request forwarding', () => {
    it('forwards POST body exactly as received to the backend', async () => {
      mockFetch.mockResolvedValueOnce(backendResponse(201, greetingPayload(GREETING_UUID, 'Test', 'Hello')));

      const payload = { name: 'Test', suffix: 'Hello' };
      const { POST } = await import('./index');
      const request = new Request('http://localhost:4321/api/greetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await POST({ request } as any);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/v1/greetings');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual(payload);
    });

    it('uses correct backend path for GET by ID', async () => {
      mockFetch.mockResolvedValueOnce(backendResponse(200, greetingPayload(GREETING_UUID, 'X', 'Y')));

      const { GET } = await import('./[id]');
      await GET({ params: { id: GREETING_UUID } } as any);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(`/api/v1/greetings/${GREETING_UUID}`);
    });

    it('uses DELETE method for delete requests', async () => {
      mockFetch.mockResolvedValueOnce(backendResponse(204));

      const { DELETE } = await import('./[id]');
      await DELETE({ params: { id: GREETING_UUID } } as any);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('DELETE');
    });

    it('sets application/json content-type on all responses', async () => {
      mockFetch.mockResolvedValueOnce(backendResponse(200, []));

      const { GET } = await import('./index');
      const response = await GET({} as any);

      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });
});
