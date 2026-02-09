import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({
  getApiTimeoutMs: async () => 5000,
  getApiRetryCount: async () => 2,
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  initLogLevel: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('fetchWithRetry', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns response on first successful attempt', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200 });

    const { fetchWithRetry } = await import('./fetchWithRetry');
    const res = await fetchWithRetry('http://example.com');

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('does not log warn on first success', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200 });

    const { default: logger } = await import('./logger');
    const { fetchWithRetry } = await import('./fetchWithRetry');
    await fetchWithRetry('http://example.com');

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('retries on failure and logs warn then info on recovery', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValueOnce({ status: 200 });

    const { default: logger } = await import('./logger');
    const { fetchWithRetry } = await import('./fetchWithRetry');
    const res = await fetchWithRetry('http://example.com');

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://example.com', attempt: 0 }),
      'Fetch attempt failed'
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://example.com', attempt: 1, status: 200 }),
      'Fetch succeeded after retry'
    );
  });

  it('throws and logs error after all retries exhausted', async () => {
    mockFetch.mockRejectedValue(new Error('always fails'));

    const { default: logger } = await import('./logger');
    const { fetchWithRetry } = await import('./fetchWithRetry');

    await expect(fetchWithRetry('http://example.com')).rejects.toThrow('always fails');
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://example.com', retryCount: 2 }),
      'All fetch attempts exhausted'
    );
  });
});
