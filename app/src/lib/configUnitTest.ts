import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = mockSend;
  },
  GetParameterCommand: class {
    constructor(public input: any) {}
  },
}));

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSend.mockReset();
    delete process.env.AWS_SSM_ENDPOINT;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
    delete process.env.API_BACKEND_URL;
    delete process.env.SERVICE_NAME;
  });

  describe('getApiBackendUrl', () => {
    it('returns default when API_BACKEND_URL is not set', async () => {
      const { getApiBackendUrl } = await import('./config');
      expect(getApiBackendUrl()).toBe('http://localhost:8080');
    });

    it('returns env var when API_BACKEND_URL is set', async () => {
      process.env.API_BACKEND_URL = 'http://my-backend:9090';
      const { getApiBackendUrl } = await import('./config');
      expect(getApiBackendUrl()).toBe('http://my-backend:9090');
    });
  });

  describe('loadDescription', () => {
    it('returns default description when SSM endpoint is not configured', async () => {
      const { loadDescription } = await import('./config');

      const description = await loadDescription();

      expect(description).toContain('greeting service');
      expect(description).toContain('Spring Cloud Service API backend');
    });

    it('returns SSM value when SSM endpoint is configured and parameter exists', async () => {
      process.env.AWS_SSM_ENDPOINT = 'http://localhost:4566';
      process.env.AWS_ACCESS_KEY_ID = 'test';
      process.env.AWS_SECRET_ACCESS_KEY = 'test';

      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'Custom description from SSM' },
      });

      const { loadDescription } = await import('./config');
      const description = await loadDescription();

      expect(description).toBe('Custom description from SSM');
    });

    it('returns default description when SSM call fails', async () => {
      process.env.AWS_SSM_ENDPOINT = 'http://localhost:4566';
      process.env.AWS_ACCESS_KEY_ID = 'test';
      process.env.AWS_SECRET_ACCESS_KEY = 'test';

      mockSend.mockRejectedValueOnce(new Error('Parameter not found'));

      const { loadDescription } = await import('./config');
      const description = await loadDescription();

      expect(description).toContain('greeting service');
    });

    it('returns default description when SSM returns no value', async () => {
      process.env.AWS_SSM_ENDPOINT = 'http://localhost:4566';
      process.env.AWS_ACCESS_KEY_ID = 'test';
      process.env.AWS_SECRET_ACCESS_KEY = 'test';

      mockSend.mockResolvedValueOnce({ Parameter: { Value: undefined } });

      const { loadDescription } = await import('./config');
      const description = await loadDescription();

      expect(description).toContain('greeting service');
    });
  });
});
