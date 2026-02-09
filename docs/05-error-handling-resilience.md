# Lesson 05 — Error Handling & Resilience

> **Level:** Intermediate
> **Goal:** Understand the retry-with-timeout pattern and how the application handles backend failures gracefully.

## 5.1 The Problem

The Astro WebUI depends on the Spring Cloud backend. Network calls can fail for many reasons — the backend is restarting, a transient network issue, or the service is overloaded. Without resilience, a single failed call means the user sees an error.

## 5.2 fetchWithRetry

All backend calls go through a shared function that adds timeout and retry:

```typescript
// app/src/lib/fetchWithRetry.ts
import { getApiTimeoutMs, getApiRetryCount } from './config';
import logger from './logger';

export async function fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
  const [timeoutMs, retryCount] = await Promise.all([getApiTimeoutMs(), getApiRetryCount()]);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (attempt > 0) {
        logger.info({ url, attempt, status: response.status }, 'Fetch succeeded after retry');
      }
      return response;
    } catch (error) {
      lastError = error;
      logger.warn({ url, attempt, retryCount, err: error }, 'Fetch attempt failed');
    }
  }
  logger.error({ url, retryCount, err: lastError }, 'All fetch attempts exhausted');
  throw lastError;
}
```

## 5.3 How It Works

### Timeout

```typescript
const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
```

`AbortSignal.timeout(ms)` is a built-in Web API (Node.js 18+). It automatically aborts the fetch after the specified duration. No need for manual `AbortController` setup.

### Retry Loop

```typescript
for (let attempt = 0; attempt <= retryCount; attempt++) {
```

With `retryCount = 3`, this runs up to 4 attempts (initial + 3 retries). Both the timeout and retry count are configurable via SSM parameters.

### Logging Strategy

| Event | Log Level | When |
|-------|-----------|------|
| Attempt failed | `warn` | Every failed attempt (transient, expected) |
| Succeeded after retry | `info` | Recovery after at least one failure |
| All attempts exhausted | `error` | Terminal failure, caller will get an exception |
| First attempt succeeds | *(none)* | Happy path — no logging overhead |

This logging strategy gives you full visibility into retry behavior without flooding logs during normal operation.

## 5.4 Configuration

Both timeout and retry count come from SSM Parameter Store:

| Parameter | Default | Effect |
|-----------|---------|--------|
| `api.timeout.ms` | `5000` | Each attempt times out after 5 seconds |
| `api.retry.count` | `3` | Up to 3 retries after the initial attempt |

Worst case latency: `(retryCount + 1) * timeoutMs` = `4 * 5000ms` = **20 seconds**.

## 5.5 Error Boundaries in Route Handlers

The `fetchWithRetry` function throws after exhausting all retries. Each route handler wraps the call in try/catch:

```typescript
// app/src/pages/api/greetings/index.ts
export const GET: APIRoute = async () => {
  try {
    const backendUrl = await getApiBackendUrl();
    const res = await fetchWithRetry(`${backendUrl}/api/v1/greetings`);
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error({ err }, 'GET /api/greetings failed');
    return new Response(JSON.stringify({ message: 'Service temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

**Key design choice:** the catch block returns **502 Bad Gateway** with a generic message. The actual error is only in the logs. This prevents leaking internal details (backend URLs, stack traces) to the client.

## 5.6 XSS Prevention

The frontend renders API responses in the UI. To prevent cross-site scripting, all dynamic content is escaped before insertion:

```typescript
// app/src/pages/index.astro — client-side script
function esc(str: string): string {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function greetingCard(g: any): string {
  return `<div class="card">
    <span class="card-name">${esc(g.name)}</span>
    <div class="card-message">${esc(g.fullMessage)}</div>
  </div>`;
}
```

The `esc()` function uses the DOM's built-in escaping — `textContent` assignment escapes HTML entities, and `innerHTML` reads back the escaped string.

## Summary

| Concept | Implementation |
|---------|---------------|
| Timeout | `AbortSignal.timeout(ms)` on every fetch call |
| Retry | Loop with configurable count from SSM |
| Logging | `warn` on failure, `info` on recovery, `error` on exhaustion |
| Error response | 502 with generic message, details in logs only |
| Configuration | Timeout and retry count from SSM Parameter Store |
| XSS prevention | `esc()` function escapes all dynamic content |

---

**Previous:** [Lesson 04 — Configuration Management](04-configuration-management.md) | **Next:** [Lesson 06 — Logging & Observability](06-logging-observability.md)
