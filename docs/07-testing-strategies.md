# Lesson 07 — Testing Strategies

> **Level:** Intermediate
> **Goal:** Understand how unit and integration tests are structured using Vitest, including mocking AWS services, the fetch API, and the pino logger.

## 7.1 Test Framework

The project uses [Vitest](https://vitest.dev/) — a Vite-native test runner that shares Astro's build tooling:

```typescript
// app/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    include: ['src/**/*UnitTest.ts', 'src/**/*IntegrationTest.ts'],
  },
});
```

| Setting | Value | Why |
|---------|-------|-----|
| `globals` | `true` | `describe`, `it`, `expect`, `vi` available without imports |
| `restoreMocks` | `true` | Mocks are automatically restored after each test |
| `include` | `*UnitTest.ts`, `*IntegrationTest.ts` | Custom naming convention (not `.test.ts` or `.spec.ts`) |

### npm Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

`vitest run` executes once (CI mode). `vitest` without `run` starts watch mode for development.

## 7.2 Test File Layout

Test files live alongside the code they test:

```
app/src/
├── lib/
│   ├── config.ts
│   ├── configUnitTest.ts              # 14 tests
│   ├── fetchWithRetry.ts
│   └── fetchWithRetryUnitTest.ts      # 4 tests
└── pages/api/
    ├── health.ts
    ├── healthUnitTest.ts              # 3 tests
    └── greetings/
        ├── index.ts
        ├── indexUnitTest.ts           # 7 tests
        ├── [id].ts
        ├── idUnitTest.ts             # 7 tests
        └── greetingsApiIntegrationTest.ts  # 19 tests
```

Co-location keeps tests close to the code they verify. The naming convention (`*UnitTest.ts` vs `*IntegrationTest.ts`) makes the test type immediately visible.

## 7.3 Mocking the AWS SDK

The SSM client is mocked so tests run without AWS access:

```typescript
// app/src/lib/configUnitTest.ts
const mockSend = vi.fn();

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = mockSend;
  },
  GetParameterCommand: class {
    constructor(public input: any) {}
  },
}));
```

This replaces the entire `@aws-sdk/client-ssm` module with a fake. The `mockSend` function can be configured per test to return SSM values or throw errors:

```typescript
// SSM returns a value
mockSend.mockResolvedValueOnce({
  Parameter: { Value: 'http://my-backend:9090' },
});

// SSM call fails (tests fallback behavior)
mockSend.mockRejectedValueOnce(new Error('Parameter not found'));
```

### Module Reset

Config tests need `vi.resetModules()` because the SSM client is created at module load time. Without resetting, all tests would share the same module instance:

```typescript
beforeEach(() => {
  vi.resetModules();
  mockSend.mockReset();
  delete process.env.AWS_SSM_ENDPOINT;
  delete process.env.AWS_REGION;
  delete process.env.SERVICE_NAME;
});
```

After resetting, each test re-imports the module with a fresh state:

```typescript
const { getApiBackendUrl } = await import('./config');
expect(await getApiBackendUrl()).toBe('http://my-backend:9090');
```

## 7.4 Mocking the Fetch API

The global `fetch` is replaced for all backend proxy tests:

```typescript
// app/src/lib/fetchWithRetryUnitTest.ts
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
```

`vi.stubGlobal` replaces `globalThis.fetch`, which is what the application code uses. Test scenarios chain responses:

```typescript
// First call fails, second succeeds
mockFetch
  .mockRejectedValueOnce(new Error('fail 1'))
  .mockResolvedValueOnce({ status: 200 });
```

## 7.5 Mocking the Logger

Any module that imports the pino logger needs a mock to prevent actual logging and to allow assertion on log calls:

```typescript
vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  initLogLevel: vi.fn(),
}));
```

This mock is used in retry tests to verify the logging strategy:

```typescript
// Verify warn was logged on failure
expect(logger.warn).toHaveBeenCalledWith(
  expect.objectContaining({ url: 'http://example.com', attempt: 0 }),
  'Fetch attempt failed'
);

// Verify info was logged on recovery
expect(logger.info).toHaveBeenCalledWith(
  expect.objectContaining({ url: 'http://example.com', attempt: 1, status: 200 }),
  'Fetch succeeded after retry'
);
```

## 7.6 Unit Test Example — Health Endpoint

The simplest test file shows the basic pattern — import the handler, call it, assert the response:

```typescript
// app/src/pages/api/healthUnitTest.ts
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
```

The health endpoint has no external dependencies, so no mocking is needed. `{} as any` provides a minimal Astro context — the handler doesn't use it.

## 7.7 Unit Test Example — Config Fallbacks

Config tests verify that every parameter has a working fallback:

```typescript
// app/src/lib/configUnitTest.ts
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
```

Three scenarios are tested for each numeric parameter: success, SSM failure, and invalid value. This ensures `parseIntOrDefault` works correctly.

## 7.8 Integration Tests

Integration tests exercise the full request pipeline — config + fetchWithRetry + route handler — with only the external boundaries mocked:

```typescript
// app/src/pages/api/greetings/greetingsApiIntegrationTest.ts

// SSM always rejects (tests use fallback defaults)
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = vi.fn().mockRejectedValue(new Error('SSM not available in test'));
  },
  GetParameterCommand: class {
    constructor(public input: any) {}
  },
}));

// Logger is silenced
vi.mock('../../../lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  initLogLevel: vi.fn(),
}));

// Backend is mocked via fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
```

### CRUD Flow Test

```typescript
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
  });
});
```

### Test Helpers

Helper functions reduce boilerplate in integration tests:

```typescript
function backendResponse(status: number, body?: object) {
  return {
    status,
    text: () => Promise.resolve(body ? JSON.stringify(body) : ''),
  };
}

function greetingPayload(id: string, name: string, suffix: string) {
  return {
    id, name, suffix,
    fullMessage: `${name}, ${suffix}`,
    clientIp: '127.0.0.1',
    userAgent: 'test',
    createdAt: '2026-02-07T10:00:00Z',
    updatedAt: '2026-02-07T10:00:00Z',
  };
}
```

## 7.9 What Integration Tests Cover

| Category | Tests | What Is Verified |
|----------|-------|-----------------|
| CRUD flow | 4 | Create, list, lookup by ID, delete |
| Error scenarios | 5 | 409 conflict, 400 validation, 404 not found, empty list, 500 error |
| Request forwarding | 4 | Body forwarded, correct backend path, DELETE method, content-type header |

The integration tests verify that the BFF layer correctly proxies status codes, bodies, and headers between the browser and the backend.

## 7.10 Running Tests

```bash
# Run all tests once
cd app && npm test

# Run in watch mode during development
cd app && npm run test:watch
```

## Summary

| Concept | Implementation |
|---------|---------------|
| Framework | Vitest with globals and auto-restore |
| Naming convention | `*UnitTest.ts` and `*IntegrationTest.ts` |
| AWS SDK mock | Fake `SSMClient` class with `vi.fn()` send method |
| Fetch mock | `vi.stubGlobal('fetch', mockFetch)` |
| Logger mock | Replace pino methods with `vi.fn()` |
| Module isolation | `vi.resetModules()` + dynamic `import()` |
| Integration boundary | SSM rejected (fallback defaults), fetch mocked (backend responses) |
| Co-location | Tests live next to source files |

---

**Previous:** [Lesson 06 — Logging & Observability](06-logging-observability.md) | **Next:** [Lesson 08 — Containerization](08-containerization.md)
