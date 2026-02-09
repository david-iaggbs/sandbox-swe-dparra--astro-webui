# Astro WebUI

A reference frontend application built with Astro SSR, designed to run on AWS ECS Fargate. Pairs with [spring-cloud-service](https://github.com/david-iaggbs/sandbox-swe-dparra--spring-cloud-service) as the backend API.

## Features

- **Astro 5** with Server-Side Rendering (SSR) via Node.js standalone adapter
- **BFF Pattern** — server-side API routes proxy requests to the Spring Cloud backend
- **AWS SSM Parameter Store** for runtime configuration (backend URL, timeouts, log level)
- **OpenTelemetry** for distributed tracing (Jaeger locally, ADOT-ready for AWS)
- **Pino** structured JSON logging with OTel trace correlation
- **Retry with backoff** on backend calls (configurable timeout and retry count)
- **AWS CDK** infrastructure as code (Java)
- **Multi-stage Docker build** with `node:20-alpine`

## Quick Start

```bash
# Start everything (LocalStack, Jaeger, Astro dev server)
./deploy-local-app.sh

# Application runs at http://localhost:4321
```

| URL | Description |
|-----|-------------|
| http://localhost:4321 | Astro WebUI |
| http://localhost:4321/api/health | Health check endpoint |
| http://localhost:16686 | Jaeger UI (traces) |

## Useful Commands

| Command | Description |
|---------|-------------|
| `./deploy-local-app.sh` | Start local development environment |
| `./deploy-local-app.sh stop` | Stop all containers |
| `./deploy-local-app.sh status` | Show container status |
| `./deploy-local-app.sh aws` | Show LocalStack AWS resources |
| `cd app && npm test` | Run all tests |
| `./deploy-infra.sh --docker` | Deploy infrastructure to AWS |
| `./deploy-app.sh` | Build and deploy application to AWS |
| `./destroy-infra.sh --docker` | Tear down AWS infrastructure |

> On macOS ARM64, use `--docker` flag for CDK commands to work around JSII issues.

## Project Structure

```
astro-webui/
├── app/                    # Astro SSR application
│   ├── src/pages/          # Pages and API routes
│   ├── src/lib/            # Shared modules (config, logger, fetchWithRetry)
│   ├── src/layouts/        # Layout components
│   ├── instrumentation.mjs # OpenTelemetry SDK bootstrap
│   ├── astro.config.mjs    # Astro configuration (Node adapter, SSR)
│   ├── Containerfile       # Multi-stage Docker build
│   └── package.json
├── cdk/                    # AWS CDK infrastructure (Java)
│   ├── src/main/java/      # CDK stack definitions
│   ├── src/test/java/      # CDK unit tests
│   ├── cdk.json            # CDK context configuration
│   └── pom.xml
├── localstack-init/        # LocalStack initialization (SSM parameters)
├── docker-compose.yml      # Local development stack (LocalStack + Jaeger)
├── deploy-local-app.sh     # Run locally
├── deploy-infra.sh         # Deploy AWS infrastructure
├── deploy-app.sh           # Build and deploy application to AWS
├── destroy-infra.sh        # Tear down infrastructure
├── Dockerfile.cdk          # CDK execution container (ARM64 workaround)
└── pom.xml                 # Parent Maven POM
```

## Application

Astro SSR application using the Node.js standalone adapter:

- **Port**: 4321
- **Health endpoint**: `GET /api/health` returns `{"status": "UP"}`
- **Rendering**: Server-side rendering (SSR) mode
- **Container**: Multi-stage build with `node:20-alpine`

## Observability

### OpenTelemetry

The application uses OpenTelemetry for distributed tracing, aligned with the [spring-cloud-service](https://github.com/david-iaggbs/sandbox-swe-dparra--spring-cloud-service) backend pattern.

**How it works:** The OTel SDK is loaded before the app via `node --import ./instrumentation.mjs`. Auto-instrumentation patches `http`, `fetch`, `@aws-sdk`, and `pino` to generate trace spans automatically. When `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, the SDK is a complete no-op.

| Environment | Traces | Endpoint | Jaeger UI |
|---|---|---|---|
| Local (localstack) | OTLP HTTP → Jaeger | `http://localhost:4318` | `http://localhost:16686` |
| AWS | Disabled | — | — |

> AWS tracing will be enabled when an ADOT sidecar is added to the ECS task definition.

### Structured Logging

The application uses [pino](https://github.com/pinojs/pino) for structured JSON logging to stdout (captured by CloudWatch via ECS `awslogs` driver). When OTel is active, pino logs are automatically enriched with `trace_id` and `span_id` for correlation.

The log level is read from SSM Parameter Store (`/{service}/log.level`) at startup, with a fallback to `info`.

## Configuration

### SSM Parameter Store

Runtime configuration is read from AWS SSM Parameter Store. In production, the ECS task role has `ssm:GetParameter` permission. Locally, LocalStack provides the SSM service.

| Parameter | Default | Description |
|---|---|---|
| `/{service}/app.description` | *(built-in text)* | Application description shown on the UI |
| `/{service}/api.backend.url` | `http://localhost:8080` | Spring Cloud Service backend URL |
| `/{service}/api.timeout.ms` | `5000` | Backend request timeout in milliseconds |
| `/{service}/api.retry.count` | `3` | Number of retry attempts on backend failure |
| `/{service}/log.level` | `info` | Application log level (debug, info, warn, error) |
| `/{service}/rate.limit.rpm` | `60` | Rate limit in requests per minute |

## Infrastructure

The CDK stack creates the following resources on an existing ECS cluster:

| Resource | Description |
|---|---|
| ECR Repository | Container image registry with scan-on-push |
| CloudWatch Log Group | `/ecs/astro-webui` with 30-day retention |
| IAM Roles | Task execution role + task role |
| Security Group | Allows inbound from VPC on port 4321 |
| ALB Target Group | Health check on `/api/health` |
| ALB Listener Rule | Routes `/*` at priority 200 |
| ECS Task Definition | Fargate, 256 CPU, 512 MiB memory |
| ECS Service | Fargate service with public IP |
| SSM Parameters | Runtime configuration (6 parameters) |

### CDK Context Values

Set in `cdk/cdk.json` or via `--context` flags:

| Key | Required | Description |
|---|---|---|
| `vpcId` | Yes | Existing VPC ID |
| `ecsClusterName` | Yes | Existing ECS cluster name |
| `albName` | Yes | Existing ALB name (matched by tag) |
| `awsAccount` | No | AWS account (auto-detected) |
| `environment` | No | Environment name (default: `dev`) |

### Prerequisites

- **Node.js 20+** — for the Astro application
- **Java 21** — for CDK infrastructure code
- **Maven** — for building CDK project
- **AWS CDK CLI** — `npm install -g aws-cdk`
- **Docker** — for container builds and CDK execution
- **AWS CLI** — configured with appropriate credentials

## Learning Path

The [docs/](docs/) folder contains a **10-lesson learning path** designed to onboard new developers to this project. Each lesson includes real code from the repository, design rationale, and further reading links.

| # | Lesson | Level |
|---|--------|-------|
| 01 | [Project Structure](docs/01-project-structure.md) | Beginner |
| 02 | [Astro SSR Fundamentals](docs/02-astro-ssr-fundamentals.md) | Beginner |
| 03 | [API Routes & BFF Pattern](docs/03-api-routes-bff-pattern.md) | Intermediate |
| 04 | [Configuration Management](docs/04-configuration-management.md) | Intermediate |
| 05 | [Error Handling & Resilience](docs/05-error-handling-resilience.md) | Intermediate |
| 06 | [Logging & Observability](docs/06-logging-observability.md) | Intermediate |
| 07 | [Testing Strategies](docs/07-testing-strategies.md) | Intermediate |
| 08 | [Containerization](docs/08-containerization.md) | Intermediate |
| 09 | [Infrastructure as Code](docs/09-infrastructure-as-code.md) | Intermediate |
| 10 | [Local Development Environment](docs/10-local-development-environment.md) | Beginner |

Start with the [Learning Path Index](docs/README.md) for the recommended reading order.
