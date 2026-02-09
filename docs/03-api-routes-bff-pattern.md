# Lesson 03 — API Routes & BFF Pattern

> **Level:** Intermediate
> **Goal:** Understand how Astro API routes act as a Backend-For-Frontend (BFF) layer, proxying requests to the Spring Cloud backend.

## 3.1 What is the BFF Pattern?

The Browser does not call the Spring Cloud backend directly. Instead, it calls Astro API routes, which run on the server and forward the request to the backend.

```
Browser  →  /api/greetings  →  Astro (server)  →  Spring Cloud /api/v1/greetings
```

**Why?**

| Benefit | Explanation |
|---------|-------------|
| Backend URL is hidden | The browser never sees the internal backend URL |
| Single origin | No CORS issues — browser and API share the same host |
| Server-side resilience | Retry logic and timeouts run on the server, not in the browser |
| Configuration | Backend URL, timeouts, and retry count come from SSM — not hardcoded in client JS |

## 3.2 API Route Handlers

An API route file exports named functions matching HTTP methods:

```typescript
// app/src/pages/api/greetings/index.ts
import type { APIRoute } from 'astro';
import { getApiBackendUrl } from '../../../lib/config';
import { fetchWithRetry } from '../../../lib/fetchWithRetry';
import logger from '../../../lib/logger';

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

The handler does three things:

1. **Reads configuration** — `getApiBackendUrl()` fetches the backend URL from SSM
2. **Forwards the request** — `fetchWithRetry()` calls the backend with timeout and retry
3. **Passes through the response** — status code and body are forwarded to the browser

## 3.3 Dynamic Route Parameters

The `[id].ts` file creates a dynamic route. The bracket notation captures the URL segment as a parameter:

```typescript
// app/src/pages/api/greetings/[id].ts
import type { APIRoute } from 'astro';
import { getApiBackendUrl } from '../../../lib/config';
import { fetchWithRetry } from '../../../lib/fetchWithRetry';
import logger from '../../../lib/logger';

export const GET: APIRoute = async ({ params }) => {
  try {
    const backendUrl = await getApiBackendUrl();
    const res = await fetchWithRetry(`${backendUrl}/api/v1/greetings/${params.id}`);
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error({ err, greetingId: params.id }, 'GET /api/greetings/:id failed');
    return new Response(JSON.stringify({ message: 'Service temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const backendUrl = await getApiBackendUrl();
    const res = await fetchWithRetry(`${backendUrl}/api/v1/greetings/${params.id}`, {
      method: 'DELETE',
    });
    return new Response(res.status === 204 ? null : await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error({ err, greetingId: params.id }, 'DELETE /api/greetings/:id failed');
    return new Response(JSON.stringify({ message: 'Service temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

The `params` object is destructured from the Astro context. A request to `/api/greetings/abc-123` produces `params.id === 'abc-123'`.

> **Further reading:** [Astro API Routes](https://docs.astro.build/en/guides/endpoints/)

## 3.4 Request Forwarding for POST

The POST handler reads the request body and forwards it:

```typescript
// app/src/pages/api/greetings/index.ts
export const POST: APIRoute = async ({ request }) => {
  try {
    const backendUrl = await getApiBackendUrl();
    const body = await request.text();
    const res = await fetchWithRetry(`${backendUrl}/api/v1/greetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error({ err }, 'POST /api/greetings failed');
    return new Response(JSON.stringify({ message: 'Service temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

The body is read as text (`request.text()`) rather than parsed as JSON. This avoids unnecessary serialization — the body is forwarded as-is.

## 3.5 Consistent Error Responses

Every catch block follows the same pattern:

1. Log the error with context (URL, greeting ID, HTTP method)
2. Return a **502 Bad Gateway** with a generic message

```typescript
catch (err) {
  logger.error({ err, greetingId: params.id }, 'GET /api/greetings/:id failed');
  return new Response(JSON.stringify({ message: 'Service temporarily unavailable' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

The client receives a safe, generic message. The actual error details are only in the server logs.

## 3.6 Route Summary

| Browser Request | Astro Route File | Backend Call |
|----------------|------------------|-------------|
| `GET /api/greetings` | `index.ts` → `GET` | `GET {backendUrl}/api/v1/greetings` |
| `POST /api/greetings` | `index.ts` → `POST` | `POST {backendUrl}/api/v1/greetings` |
| `GET /api/greetings/:id` | `[id].ts` → `GET` | `GET {backendUrl}/api/v1/greetings/:id` |
| `DELETE /api/greetings/:id` | `[id].ts` → `DELETE` | `DELETE {backendUrl}/api/v1/greetings/:id` |
| `GET /api/health` | `health.ts` → `GET` | *(no backend call — returns directly)* |
| `GET /api/config` | `config.ts` → `GET` | *(no backend call — reads SSM)* |

## Summary

| Concept | Implementation |
|---------|---------------|
| BFF pattern | Astro API routes proxy to Spring Cloud backend |
| Route handlers | Export `GET`, `POST`, `DELETE` as `APIRoute` functions |
| Dynamic params | `[id].ts` captures URL segments via `params.id` |
| Body forwarding | `request.text()` — forwarded without re-parsing |
| Error handling | `catch` block logs and returns 502 with generic message |
| Configuration | Backend URL resolved from SSM on every request |

---

**Previous:** [Lesson 02 — Astro SSR Fundamentals](02-astro-ssr-fundamentals.md) | **Next:** [Lesson 04 — Configuration Management](04-configuration-management.md)
