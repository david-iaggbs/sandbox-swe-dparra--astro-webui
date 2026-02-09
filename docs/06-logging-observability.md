# Lesson 06 — Logging & Observability

> **Level:** Intermediate
> **Goal:** Understand how structured logging with Pino and distributed tracing with OpenTelemetry work together to provide full observability.

## 6.1 Two Pillars of Observability

This project implements two observability pillars:

| Pillar | Tool | Transport |
|--------|------|-----------|
| **Traces** | OpenTelemetry auto-instrumentation | OTLP HTTP → Jaeger |
| **Logs** | Pino structured JSON | stdout → CloudWatch |

Metrics are not yet implemented (planned for when an ADOT sidecar is added).

## 6.2 OpenTelemetry Instrumentation

The OTel SDK is loaded before the application starts, using Node.js `--import` flag:

```javascript
// app/instrumentation.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.1',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: true },
      }),
    ],
  });
  sdk.start();
} else {
  console.log('OTel SDK disabled — OTEL_EXPORTER_OTLP_ENDPOINT not set');
}
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `--import` flag | Loads before any app code, so monkey-patching works |
| `createRequire` | OTel packages are CJS; ESM named imports fail on Node 22 |
| `resourceFromAttributes` | Replaces deprecated `Resource` constructor |
| `fs` instrumentation disabled | Too noisy — generates spans for every file read |
| `pino` instrumentation enabled | Enriches log entries with `trace_id` and `span_id` |
| Guard on `OTEL_EXPORTER_OTLP_ENDPOINT` | Complete no-op when not set (AWS, until ADOT is added) |

> **Further reading:** [OpenTelemetry Node.js SDK](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)

## 6.3 Why `--import` Instead of Regular Import?

Auto-instrumentation works by monkey-patching Node.js modules (`http`, `fetch`, `pino`). This patching must happen **before** the application imports these modules. The `--import` flag ensures the instrumentation file loads first:

```bash
# Production
node --import ./instrumentation.mjs dist/server/entry.mjs

# Development (via NODE_OPTIONS)
NODE_OPTIONS='--import ./instrumentation.mjs' astro dev
```

If you imported `instrumentation.mjs` from inside the app code, the patching would happen too late and traces would be incomplete.

## 6.4 Pino Structured Logger

The application uses Pino for structured JSON logging:

```typescript
// app/src/lib/logger.ts
import pino from 'pino';

const transport =
  process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined;

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport,
  base: { service: process.env.SERVICE_NAME || 'astro-webui' },
});

export default logger;
```

| Environment | Log Format | Why |
|-------------|-----------|-----|
| Development | `pino-pretty` (colorized, human-readable) | Easy to read in terminal |
| Production | Raw JSON | Machine-parseable by CloudWatch |

### Production Log Output

```json
{"level":30,"time":1707500000000,"service":"astro-webui","trace_id":"abc123","span_id":"def456","msg":"Fetch succeeded after retry","url":"http://backend/api/v1/greetings","attempt":1,"status":200}
```

When OTel is active, the pino instrumentation automatically adds `trace_id` and `span_id` to every log entry. This lets you correlate logs with traces in Jaeger.

## 6.5 Dynamic Log Level from SSM

The log level is initialized from SSM Parameter Store at startup:

```typescript
// app/src/lib/logger.ts
export async function initLogLevel(): Promise<void> {
  try {
    const { getLogLevel } = await import('./config');
    const level = await getLogLevel();
    logger.level = level;
    logger.info({ level }, 'Log level set from SSM');
  } catch (err) {
    logger.warn({ err }, 'Failed to set log level from SSM, keeping default');
  }
}

// Fire-and-forget: update level from SSM once available.
initLogLevel();
```

### Circular Dependency Avoidance

`logger.ts` needs `config.ts` (to get log level), and `config.ts` could need `logger.ts` (for error logging). This circular dependency is broken by:

1. **`logger.ts`** uses `dynamic import()` in `initLogLevel()` — not a top-level import
2. **`config.ts`** uses `console.error` — never imports the logger

The logger is usable immediately at the default level (`info`). The SSM level updates asynchronously.

## 6.6 Vite Externalization

Pino must be externalized from the Vite bundle so OTel can monkey-patch it:

```javascript
// app/astro.config.mjs
export default defineConfig({
  vite: {
    ssr: {
      external: ['pino', 'pino-pretty'],
    },
  },
});
```

Without this, Astro would bundle pino into `entry.mjs`. The bundled version can't be patched by OTel's `@opentelemetry/instrumentation-pino`, and trace correlation would not work.

## 6.7 Environment Matrix

| Environment | OTel Traces | Log Format | Log Level |
|-------------|------------|------------|-----------|
| Local dev | Jaeger (`localhost:4318`) | pino-pretty | `debug` (from SSM) |
| AWS (current) | Disabled | JSON to CloudWatch | `info` (from SSM) |
| AWS (future) | ADOT sidecar | JSON to CloudWatch | `info` (from SSM) |

## Summary

| Concept | Implementation |
|---------|---------------|
| Tracing | OTel auto-instrumentation via `--import ./instrumentation.mjs` |
| Logging | Pino structured JSON with `pino-pretty` for dev |
| Correlation | OTel pino instrumentation adds `trace_id`/`span_id` to logs |
| Log level | Read from SSM at startup, fire-and-forget async init |
| Vite externalization | `pino` excluded from bundle so OTel patching works |
| No-op guard | OTel SDK is completely disabled when endpoint is not set |

---

**Previous:** [Lesson 05 — Error Handling & Resilience](05-error-handling-resilience.md) | **Next:** [Lesson 07 — Testing Strategies](07-testing-strategies.md)
