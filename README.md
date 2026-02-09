# Astro WebUI — ECS Fargate Reference

Reference solution for deploying frontend applications (Astro SSR) to AWS ECS Fargate. Pairs with [spring-cloud-service](https://github.com/david-iaggbs/sandbox-swe-dparra--spring-cloud-service) as the backend reference.

## Project Structure

```
astro-webui/
├── app/                    # Astro SSR application
│   ├── src/pages/          # Pages and API routes
│   ├── src/layouts/        # Layout components
│   ├── astro.config.mjs    # Astro configuration (Node adapter, SSR)
│   ├── Containerfile       # Multi-stage Docker build
│   └── package.json
├── cdk/                    # AWS CDK infrastructure (Java)
│   ├── src/main/java/      # CDK stack definitions
│   ├── src/test/java/      # CDK unit tests
│   ├── cdk.json            # CDK context configuration
│   └── pom.xml
├── deploy-infra.sh         # Deploy CDK infrastructure
├── deploy-app.sh           # Build, push image, deploy to ECS
├── deploy-local-app.sh     # Run locally for development
├── destroy-infra.sh        # Tear down infrastructure
├── Dockerfile.cdk          # CDK execution container (ARM64 workaround)
└── pom.xml                 # Parent Maven POM
```

## Prerequisites

- **Node.js 20+** — for the Astro application
- **Java 21** — for CDK infrastructure code
- **Maven** — for building CDK project
- **AWS CDK CLI** — `npm install -g aws-cdk`
- **Docker** — for container builds and optional CDK execution
- **AWS CLI** — configured with appropriate credentials

## Quick Start

### Local Development

```bash
./deploy-local-app.sh          # Start Astro dev server on http://localhost:4321
./deploy-local-app.sh build    # Build and preview production bundle
```

### Deploy to AWS

```bash
# 1. Deploy infrastructure (one-time or on infra changes)
./deploy-infra.sh

# 2. Build and deploy the application
./deploy-app.sh
```

### Tear Down

```bash
./destroy-infra.sh
```

> On macOS ARM64, use `--docker` flag for CDK commands to work around JSII issues:
> `./deploy-infra.sh --docker`

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

### CDK Context Values

Set in `cdk/cdk.json` or via `--context` flags:

| Key | Required | Description |
|---|---|---|
| `vpcId` | Yes | Existing VPC ID |
| `ecsClusterName` | Yes | Existing ECS cluster name |
| `albName` | Yes | Existing ALB name (matched by tag) |
| `awsAccount` | No | AWS account (auto-detected) |
| `environment` | No | Environment name (default: `dev`) |

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
