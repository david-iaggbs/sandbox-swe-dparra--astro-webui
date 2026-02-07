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
