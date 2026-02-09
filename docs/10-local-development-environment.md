# Lesson 10 — Local Development Environment

> **Level:** Beginner
> **Goal:** Understand how Docker Compose, LocalStack, and Jaeger work together to create a production-like local development environment.

## 10.1 Architecture

The local development environment mirrors the AWS production setup using containers:

```
┌──────────────────────────────────────────────────────────┐
│  Host Machine                                            │
│                                                          │
│  ┌──────────────────┐                                    │
│  │  Astro Dev Server │ ◄─── http://localhost:4321        │
│  │  (npm run dev)    │                                   │
│  └──────┬───────┬────┘                                   │
│         │       │                                        │
│   SSM   │       │ OTLP traces                            │
│         ▼       ▼                                        │
│  ┌────────────┐  ┌───────────────┐                       │
│  │ LocalStack │  │    Jaeger     │                       │
│  │  :4566     │  │  :4318 :16686 │                       │
│  └────────────┘  └───────────────┘                       │
│      Docker          Docker                              │
└──────────────────────────────────────────────────────────┘
```

| Component | Port | Replaces in Production |
|-----------|------|----------------------|
| Astro dev server | 4321 | ECS Fargate task |
| LocalStack | 4566 | AWS SSM Parameter Store |
| Jaeger | 4318, 16686 | ADOT sidecar (future) |

The Astro application runs directly on the host (not in Docker) for fast hot-reload. Only the AWS service emulators run as containers.

## 10.2 Docker Compose

```yaml
# docker-compose.yml
services:
  localstack:
    image: localstack/localstack:latest
    container_name: localstack
    ports:
      - "4566:4566"
    environment:
      - SERVICES=ssm
      - DEBUG=1
      - PERSISTENCE=1
    volumes:
      - "./localstack-init:/etc/localstack/init/ready.d"
      - "localstack-data:/var/lib/localstack"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4566/_localstack/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  jaeger:
    image: jaegertracing/all-in-one:latest
    container_name: jaeger
    ports:
      - "16686:16686"
      - "4317:4317"
      - "4318:4318"
    environment:
      - COLLECTOR_OTLP_ENABLED=true

volumes:
  localstack-data:
```

### LocalStack Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `SERVICES=ssm` | Only SSM | Reduces startup time and resource usage |
| `PERSISTENCE=1` | Enabled | SSM parameters survive container restarts |
| `localstack-data` volume | Named volume | Persists state across `docker-compose down/up` |
| Health check | `/health` endpoint | Script waits for this before starting the app |
| Init volume | `./localstack-init:/etc/localstack/init/ready.d` | Seeds parameters on startup |

### Jaeger Configuration

| Port | Protocol | Purpose |
|------|----------|---------|
| 16686 | HTTP | Jaeger UI — browse and search traces |
| 4317 | gRPC | OTLP collector (gRPC protocol) |
| 4318 | HTTP | OTLP collector (HTTP protocol, used by this project) |

`COLLECTOR_OTLP_ENABLED=true` enables Jaeger's built-in OTLP receiver, so it can accept traces directly from the OTel SDK without a separate collector.

## 10.3 SSM Parameter Seeding

When LocalStack starts, it runs scripts from the init directory:

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

# ... and 4 more parameters
```

| Parameter | Local Value | Production Value | Difference |
|-----------|------------|-----------------|------------|
| `api.backend.url` | `http://localhost:8080` | ALB DNS name | Backend runs on host locally |
| `log.level` | `debug` | `info` | More verbose locally |
| `api.timeout.ms` | `5000` | `5000` | Same |
| `api.retry.count` | `3` | `3` | Same |

`awslocal` is a wrapper around the AWS CLI that automatically targets `http://localhost:4566`.

## 10.4 The Deployment Script

`deploy-local-app.sh` orchestrates the entire local environment:

```bash
# Start everything (default command)
./deploy-local-app.sh

# Or specify a command
./deploy-local-app.sh [command]
```

| Command | Action |
|---------|--------|
| `start` | Start containers, wait for health, run app with SSM (default) |
| `start-simple` | Run dev server without AWS emulation |
| `stop` | Stop all Docker containers |
| `restart` | Stop + start |
| `logs` | Tail LocalStack logs |
| `status` | Show container status and health |
| `aws` | List SSM parameters in LocalStack |
| `clean` | Stop containers, remove volumes, delete `node_modules` and `dist` |

### Environment Variables

When starting with LocalStack, the script exports:

```bash
export AWS_SSM_ENDPOINT="http://localhost:4566"
export AWS_REGION="eu-west-1"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

| Variable | Purpose |
|----------|---------|
| `AWS_SSM_ENDPOINT` | Redirects SSM client from real AWS to LocalStack |
| `AWS_REGION` | AWS SDK region (must match LocalStack region) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Enables OTel SDK and points traces to Jaeger |

In production, `AWS_SSM_ENDPOINT` is not set (SDK uses real AWS) and `OTEL_EXPORTER_OTLP_ENDPOINT` is not set (OTel is a no-op).

### Health Check Wait

The script waits for LocalStack before starting the application:

```bash
local retries=30
while ! curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; do
    retries=$((retries - 1))
    if [ $retries -le 0 ]; then
        log_error "LocalStack failed to start"
        exit 1
    fi
    sleep 1
done
```

This prevents the application from starting before SSM parameters are available.

## 10.5 Development Workflow

### First Time Setup

```bash
# 1. Ensure Docker is running
# 2. Start the full environment
./deploy-local-app.sh
```

This will:
1. Start LocalStack and Jaeger containers
2. Wait for LocalStack health check
3. Seed SSM parameters (via `init-aws.sh`)
4. Install npm dependencies (if needed)
5. Start the Astro dev server with hot reload

### Daily Workflow

```bash
# Start containers + app
./deploy-local-app.sh

# In another terminal: check AWS resources
./deploy-local-app.sh aws

# When done
./deploy-local-app.sh stop
```

### Without AWS Emulation

For quick UI work that doesn't need SSM or tracing:

```bash
./deploy-local-app.sh start-simple
```

This starts the Astro dev server without Docker containers. SSM calls will fail, but fallback defaults keep the app running.

## 10.6 Accessing Local Services

| Service | URL | Purpose |
|---------|-----|---------|
| Application | http://localhost:4321 | Astro WebUI |
| Health check | http://localhost:4321/api/health | `{"status": "UP"}` |
| Config endpoint | http://localhost:4321/api/config | Current SSM values |
| Jaeger UI | http://localhost:16686 | Browse distributed traces |
| LocalStack | http://localhost:4566 | AWS service endpoints |

### Viewing Traces in Jaeger

1. Open http://localhost:16686
2. Select `astro-webui` from the Service dropdown
3. Click **Find Traces**
4. Each trace shows the full request lifecycle: incoming HTTP request → SSM parameter fetch → backend API call

## 10.7 Debugging SSM Parameters

```bash
# List all parameters
./deploy-local-app.sh aws

# Or query directly
docker exec localstack awslocal ssm get-parameters-by-path \
  --path "/astro-webui/" \
  --region eu-west-1

# Update a parameter at runtime
docker exec localstack awslocal ssm put-parameter \
  --name "/astro-webui/log.level" \
  --value "warn" \
  --type String \
  --region eu-west-1 \
  --overwrite
```

Because there is no SSM caching, parameter changes take effect on the next request.

## 10.8 Cleanup

```bash
# Stop containers (keeps volume data)
./deploy-local-app.sh stop

# Full cleanup (removes volumes, node_modules, dist)
./deploy-local-app.sh clean
```

The `clean` command asks for confirmation before removing `node_modules` and `dist`.

## 10.9 Environment Matrix

| Aspect | Local (`start`) | Local (`start-simple`) | AWS Production |
|--------|----------------|----------------------|---------------|
| SSM | LocalStack | Fallback defaults | Real AWS SSM |
| OTel traces | Jaeger | Disabled | Disabled (ADOT planned) |
| Log format | `pino-pretty` (colorized) | `pino-pretty` (colorized) | JSON to CloudWatch |
| Backend URL | `http://localhost:8080` | `http://localhost:8080` (fallback) | ALB DNS name |
| Hot reload | Yes | Yes | No (container restart) |

## Summary

| Concept | Implementation |
|---------|---------------|
| AWS emulation | LocalStack with SSM service only |
| Tracing | Jaeger all-in-one with OTLP receiver |
| Orchestration | Docker Compose with health checks |
| Parameter seeding | `init-aws.sh` runs on LocalStack startup |
| Persistence | Named Docker volume for SSM state |
| Environment parity | Same SSM parameter paths as production |
| Script | `deploy-local-app.sh` manages the full lifecycle |
| Fallback mode | `start-simple` runs without any containers |

---

**Previous:** [Lesson 09 — Infrastructure as Code](09-infrastructure-as-code.md)
