# Lesson 04 — Configuration Management

> **Level:** Intermediate
> **Goal:** Understand how the application reads runtime configuration from AWS SSM Parameter Store with safe fallback defaults.

## 4.1 Why SSM Parameter Store?

Configuration values like the backend URL, timeouts, and log level should not be hardcoded. SSM Parameter Store provides:

- **Centralized configuration** — one place to manage all settings
- **Runtime changes** — update a parameter without redeploying
- **Environment separation** — different values per environment (dev, staging, prod)
- **IAM integration** — ECS task role controls access

## 4.2 The Config Module

All SSM access is centralized in a single module:

```typescript
// app/src/lib/config.ts
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'astro-webui';
const AWS_REGION = process.env.AWS_REGION ?? 'eu-west-1';

function createSsmClient(): SSMClient {
  const endpoint = process.env.AWS_SSM_ENDPOINT;
  return new SSMClient({
    region: AWS_REGION,
    ...(endpoint && { endpoint }),
  });
}

const ssmClient = createSsmClient();
```

The SSM client is created once at module load. The `AWS_SSM_ENDPOINT` environment variable redirects calls to LocalStack during local development.

| Environment | `AWS_SSM_ENDPOINT` | SSM Target |
|-------------|-------------------|------------|
| Local | `http://localhost:4566` | LocalStack |
| AWS | *(not set)* | Real AWS SSM |

## 4.3 Parameter Fetching with Fallbacks

Every parameter has a safe fallback default:

```typescript
// app/src/lib/config.ts
async function getParameter(name: string, fallback: string): Promise<string> {
  try {
    const response = await ssmClient.send(
      new GetParameterCommand({ Name: `/${SERVICE_NAME}/${name}` })
    );
    return response.Parameter?.Value ?? fallback;
  } catch (error) {
    console.error(`SSM parameter /${SERVICE_NAME}/${name} fetch failed, using fallback`, error);
    return fallback;
  }
}
```

Key design decisions:

1. **Parameter path convention** — `/{serviceName}/{parameterName}` (e.g., `/astro-webui/api.backend.url`)
2. **Graceful degradation** — if SSM is unreachable, the app still works with defaults
3. **Error logging** — failures are logged with `console.error` (not the pino logger, to avoid a circular dependency)

## 4.4 Typed Configuration Functions

Each parameter has a dedicated exported function:

```typescript
// app/src/lib/config.ts
export async function getApiBackendUrl(): Promise<string> {
  return getParameter('api.backend.url', 'http://localhost:8080');
}

export async function getApiTimeoutMs(): Promise<number> {
  const value = await getParameter('api.timeout.ms', '5000');
  return parseIntOrDefault(value, 5000);
}

export async function getApiRetryCount(): Promise<number> {
  const value = await getParameter('api.retry.count', '3');
  return parseIntOrDefault(value, 3);
}

export async function getLogLevel(): Promise<string> {
  return getParameter('log.level', 'info');
}
```

Numeric parameters use a safe parser:

```typescript
// app/src/lib/config.ts
function parseIntOrDefault(value: string, fallback: number): number {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
```

This prevents `NaN` from propagating if someone puts a non-numeric value in SSM.

## 4.5 Parameters Reference

| Parameter | Default | Type | Used By |
|-----------|---------|------|---------|
| `api.backend.url` | `http://localhost:8080` | string | API route handlers |
| `api.timeout.ms` | `5000` | number | `fetchWithRetry` |
| `api.retry.count` | `3` | number | `fetchWithRetry` |
| `app.description` | *(built-in text)* | string | Home page |
| `log.level` | `info` | string | Logger initialization |
| `rate.limit.rpm` | `60` | number | Rate limiting |

## 4.6 LocalStack Seeding

For local development, SSM parameters are seeded by a shell script that runs when LocalStack starts:

```bash
# localstack-init/init-aws.sh
SERVICE_NAME="astro-webui"
REGION="eu-west-1"

awslocal ssm put-parameter \
  --name "/${SERVICE_NAME}/api.backend.url" \
  --value "http://localhost:8080" \
  --type String \
  --region "${REGION}" \
  --overwrite

awslocal ssm put-parameter \
  --name "/${SERVICE_NAME}/log.level" \
  --value "debug" \
  --type String \
  --region "${REGION}" \
  --overwrite
```

Note that the local log level is `debug` while the production default is `info`.

> **Further reading:** [AWS SSM Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)

## 4.7 No Caching

Parameters are fetched from SSM on every request. This means changes take effect immediately without restarting the application. For high-traffic production use, you may want to add a TTL cache, but for this reference project the simplicity of direct reads is preferred.

## Summary

| Concept | Implementation |
|---------|---------------|
| SSM client | Singleton `SSMClient` with optional LocalStack endpoint |
| Parameter path | `/{serviceName}/{parameterName}` convention |
| Fallback defaults | Every parameter has a hardcoded fallback |
| Type safety | `parseIntOrDefault` prevents NaN propagation |
| Local dev | `init-aws.sh` seeds LocalStack with development values |
| Circular dependency | Config uses `console.error` instead of pino logger |

---

**Previous:** [Lesson 03 — API Routes & BFF Pattern](03-api-routes-bff-pattern.md) | **Next:** [Lesson 05 — Error Handling & Resilience](05-error-handling-resilience.md)
