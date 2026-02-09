# Lesson 01 — Project Structure

> **Level:** Beginner
> **Goal:** Understand how the Astro WebUI project is organized and how each part fits together.

## 1.1 Repository Layout

The repository follows a monorepo-style structure with two main directories: the Astro application and the CDK infrastructure.

```
astro-webui/
├── app/                        # Astro SSR application
│   ├── src/
│   │   ├── pages/              # File-based routing
│   │   │   ├── index.astro     # Home page (SSR)
│   │   │   └── api/            # API route handlers
│   │   │       ├── health.ts   # Health check endpoint
│   │   │       ├── config.ts   # Configuration endpoint
│   │   │       └── greetings/  # Greeting CRUD endpoints
│   │   ├── layouts/            # Reusable page layouts
│   │   │   └── Layout.astro    # Main layout with header/footer
│   │   └── lib/                # Shared modules
│   │       ├── config.ts       # SSM parameter fetching
│   │       ├── logger.ts       # Pino structured logger
│   │       └── fetchWithRetry.ts  # HTTP client with retry
│   ├── instrumentation.mjs     # OpenTelemetry SDK bootstrap
│   ├── astro.config.mjs        # Astro configuration
│   ├── vitest.config.ts        # Test configuration
│   ├── Containerfile           # Multi-stage Docker build
│   └── package.json            # Dependencies and scripts
├── cdk/                        # AWS CDK infrastructure (Java)
│   ├── src/main/java/          # Stack definitions
│   └── pom.xml                 # Maven dependencies
├── localstack-init/            # LocalStack seed data
│   └── init-aws.sh             # SSM parameter initialization
├── docker-compose.yml          # LocalStack + Jaeger
├── deploy-local-app.sh         # Local development script
├── deploy-infra.sh             # Deploy CDK to AWS
├── deploy-app.sh               # Build and deploy app to ECS
└── destroy-infra.sh            # Tear down AWS resources
```

## 1.2 File-Based Routing

Astro uses file-based routing. Every file in `src/pages/` becomes a route automatically:

| File | Route | Type |
|------|-------|------|
| `src/pages/index.astro` | `/` | SSR page |
| `src/pages/api/health.ts` | `/api/health` | API endpoint |
| `src/pages/api/config.ts` | `/api/config` | API endpoint |
| `src/pages/api/greetings/index.ts` | `/api/greetings` | API endpoint |
| `src/pages/api/greetings/[id].ts` | `/api/greetings/:id` | Dynamic API endpoint |

The `[id].ts` syntax creates a dynamic route — the bracket notation tells Astro to capture that URL segment as a parameter.

> **Further reading:** [Astro Routing](https://docs.astro.build/en/guides/routing/)

## 1.3 The `src/lib/` Directory

Shared modules live in `src/lib/`. These are plain TypeScript files imported by pages and API routes:

```
src/lib/
├── config.ts          # Reads configuration from SSM Parameter Store
├── logger.ts          # Pino logger with OTel trace correlation
└── fetchWithRetry.ts  # HTTP client with configurable retry and timeout
```

This separation keeps business logic out of route handlers. A route handler should only do three things: parse the request, call shared modules, and return a response.

## 1.4 Separation of Application and Infrastructure

The `app/` and `cdk/` directories are independent:

| Directory | Language | Build Tool | Purpose |
|-----------|----------|------------|---------|
| `app/` | TypeScript | npm | Astro SSR application |
| `cdk/` | Java | Maven | AWS infrastructure definitions |

They share no code. The CDK stack creates AWS resources (ECS, ECR, SSM parameters) that the application consumes at runtime. The only contract between them is:

- **Port 4321** — the container listens here
- **`/api/health`** — the ALB health check path
- **`SERVICE_NAME`** — environment variable set by CDK, used by the app to construct SSM parameter paths

## 1.5 Shell Scripts

Four shell scripts orchestrate the deployment lifecycle:

| Script | When to Use |
|--------|-------------|
| `deploy-local-app.sh` | Daily development — starts LocalStack, Jaeger, and Astro dev server |
| `deploy-infra.sh` | Once or on infra changes — creates/updates AWS resources via CDK |
| `deploy-app.sh` | On code changes — builds Docker image, pushes to ECR, updates ECS service |
| `destroy-infra.sh` | Cleanup — tears down all AWS resources |

All scripts accept a `--docker` flag to run CDK inside a Docker container, working around JSII issues on macOS ARM64.

## Summary

| Concept | Implementation |
|---------|---------------|
| Routing | File-based in `src/pages/` — `.astro` for pages, `.ts` for API routes |
| Shared logic | `src/lib/` modules imported by routes |
| Infrastructure | `cdk/` directory with Java CDK stack |
| Local dev | `docker-compose.yml` + `deploy-local-app.sh` |
| Deployment | Shell scripts wrapping CDK and Docker commands |

---

**Next:** [Lesson 02 — Astro SSR Fundamentals](02-astro-ssr-fundamentals.md)
