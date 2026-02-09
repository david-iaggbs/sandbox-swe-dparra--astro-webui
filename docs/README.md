# Learning Path — Astro WebUI

A **10-lesson course** that walks you through every key concept in this project, from Astro SSR basics to AWS ECS deployment. Each lesson includes code snippets from the actual source and links to external references.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Astro application runtime |
| Docker | Latest | Container builds, LocalStack, Jaeger |
| Java | 21 | CDK infrastructure code |
| Maven | 3.9+ | CDK project build |
| AWS CLI | 2.x | AWS operations |
| AWS CDK CLI | 2.x | `npm install -g aws-cdk` |

## Solution Overview

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Astro 5 SSR | Server-rendered UI with client interactivity |
| BFF API | Astro API routes | Proxy layer between browser and backend |
| Backend | Spring Cloud Service | RESTful API (separate repository) |
| Configuration | AWS SSM Parameter Store | Runtime configuration (URLs, timeouts, log levels) |
| Observability | OpenTelemetry + Pino | Distributed tracing and structured logging |
| Infrastructure | AWS CDK (Java) | ECS Fargate, ECR, ALB, IAM, SSM |
| Local Dev | LocalStack + Jaeger | AWS emulation and trace visualization |

## Course Structure

### Part I — Application Foundations

| # | Lesson | Level | Key Concepts |
|---|--------|-------|-------------|
| 01 | [Project Structure](01-project-structure.md) | Beginner | Astro project layout, file-based routing, `src/lib/` modules |
| 02 | [Astro SSR Fundamentals](02-astro-ssr-fundamentals.md) | Beginner | Server-side rendering, Node adapter, standalone mode |
| 03 | [API Routes & BFF Pattern](03-api-routes-bff-pattern.md) | Intermediate | `APIRoute` handlers, backend proxy, request forwarding |
| 04 | [Configuration Management](04-configuration-management.md) | Intermediate | SSM Parameter Store, fallback defaults, `@aws-sdk/client-ssm` |
| 05 | [Error Handling & Resilience](05-error-handling-resilience.md) | Intermediate | Retry logic, timeouts, `AbortSignal.timeout`, structured error responses |
| 06 | [Logging & Observability](06-logging-observability.md) | Intermediate | Pino, OpenTelemetry, trace correlation, `instrumentation.mjs` |
| 07 | [Testing Strategies](07-testing-strategies.md) | Intermediate | Vitest, module mocking, unit vs integration tests |

### Part II — Infrastructure & Deployment

| # | Lesson | Level | Key Concepts |
|---|--------|-------|-------------|
| 08 | [Containerization](08-containerization.md) | Intermediate | Multi-stage Docker build, Vite externalization, `--import` flag |
| 09 | [Infrastructure as Code](09-infrastructure-as-code.md) | Advanced | AWS CDK (Java), ECS Fargate, ALB, IAM roles, SSM parameters |
| 10 | [Local Development Environment](10-local-development-environment.md) | Beginner | docker-compose, LocalStack, Jaeger, deploy scripts |

## How to Use This Course

1. **Read sequentially** — lessons build on each other, especially in Part I
2. **Follow along in code** — each lesson references actual source files
3. **Run locally** — use `./deploy-local-app.sh` to see concepts in action
4. **Experiment** — modify parameters in LocalStack SSM and observe behavior changes

## Quick Start

```bash
# Clone and start
git clone https://github.com/david-iaggbs/sandbox-swe-dparra--astro-webui.git
cd sandbox-swe-dparra--astro-webui
./deploy-local-app.sh
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│              http://localhost:4321                   │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│              Astro WebUI (SSR)                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Pages   │  │ API      │  │ Shared Libs       │  │
│  │  (SSR)   │  │ Routes   │  │ config / logger / │  │
│  │          │  │ (BFF)    │  │ fetchWithRetry     │  │
│  └──────────┘  └────┬─────┘  └───────────────────┘  │
│                     │                                │
│  ┌──────────────────▼──────────────────────────────┐ │
│  │  OpenTelemetry (instrumentation.mjs)            │ │
│  │  Pino (structured logging)                      │ │
│  └─────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │ fetch (with retry + timeout)
┌────────────────────▼────────────────────────────────┐
│         Spring Cloud Service (Backend)              │
│              /api/v1/greetings                       │
└─────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│                AWS Services                         │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │   SSM   │  │   ECR    │  │   CloudWatch      │  │
│  │ Params  │  │  Images  │  │   Logs            │  │
│  └─────────┘  └──────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────┘
```
