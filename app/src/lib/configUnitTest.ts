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
    delete process.env.AWS_REGION;
    delete process.env.SERVICE_NAME;
  });

  describe('loadDescription', () => {
    it('returns SSM value using default endpoint (production mode)', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'Description from AWS SSM' },
      });

      const { loadDescription } = await import('./config');
      const description = await loadDescription();

      expect(description).toBe('Description from AWS SSM');
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('returns SSM value when SSM endpoint is overridden (LocalStack)', async () => {
      process.env.AWS_SSM_ENDPOINT = 'http://localhost:4566';

      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'Custom description from SSM' },
      });

      const { loadDescription } = await import('./config');
      const description = await loadDescription();

      expect(description).toBe('Custom description from SSM');
    });

    it('returns default description when SSM call fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Parameter not found'));

      const { loadDescription } = await import('./config');
      const description = await loadDescription();

      expect(description).toContain('greeting service');
    });

    it('returns default description when SSM returns no value', async () => {
      mockSend.mockResolvedValueOnce({ Parameter: { Value: undefined } });

      const { loadDescription } = await import('./config');
      const description = await loadDescription();

      expect(description).toContain('greeting service');
    });
  });

  describe('getApiBackendUrl', () => {
    it('returns SSM value when parameter exists', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'http://my-backend:9090' },
      });

      const { getApiBackendUrl } = await import('./config');
      expect(await getApiBackendUrl()).toBe('http://my-backend:9090');
    });

    it('returns default when SSM call fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Parameter not found'));

      const { getApiBackendUrl } = await import('./config');
      expect(await getApiBackendUrl()).toBe('http://localhost:8080');
    });
  });

  describe('getApiTimeoutMs', () => {
    it('returns SSM value as number', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: '10000' },
      });

      const { getApiTimeoutMs } = await import('./config');
      expect(await getApiTimeoutMs()).toBe(10000);
    });

    it('returns default when SSM call fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Parameter not found'));

      const { getApiTimeoutMs } = await import('./config');
      expect(await getApiTimeoutMs()).toBe(5000);
    });

    it('returns default when SSM returns non-numeric value', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'not-a-number' },
      });

      const { getApiTimeoutMs } = await import('./config');
      expect(await getApiTimeoutMs()).toBe(5000);
    });
  });

  describe('getApiRetryCount', () => {
    it('returns SSM value as number', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: '5' },
      });

      const { getApiRetryCount } = await import('./config');
      expect(await getApiRetryCount()).toBe(5);
    });

    it('returns default when SSM call fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Parameter not found'));

      const { getApiRetryCount } = await import('./config');
      expect(await getApiRetryCount()).toBe(3);
    });

    it('returns default when SSM returns non-numeric value', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'abc' },
      });

      const { getApiRetryCount } = await import('./config');
      expect(await getApiRetryCount()).toBe(3);
    });
  });

  describe('getLogLevel', () => {
    it('returns SSM value', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'debug' },
      });

      const { getLogLevel } = await import('./config');
      expect(await getLogLevel()).toBe('debug');
    });

    it('returns default when SSM call fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Parameter not found'));

      const { getLogLevel } = await import('./config');
      expect(await getLogLevel()).toBe('info');
    });
  });

  describe('getRateLimitRpm', () => {
    it('returns SSM value as number', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: '120' },
      });

      const { getRateLimitRpm } = await import('./config');
      expect(await getRateLimitRpm()).toBe(120);
    });

    it('returns default when SSM call fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Parameter not found'));

      const { getRateLimitRpm } = await import('./config');
      expect(await getRateLimitRpm()).toBe(60);
    });

    it('returns default when SSM returns non-numeric value', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: '' },
      });

      const { getRateLimitRpm } = await import('./config');
      expect(await getRateLimitRpm()).toBe(60);
    });
  });
});
