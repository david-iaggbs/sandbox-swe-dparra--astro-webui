# Lesson 08 — Containerization

> **Level:** Intermediate
> **Goal:** Understand the multi-stage Docker build, why `node_modules` is needed at runtime, and how the OTel instrumentation file is integrated.

## 8.1 The Containerfile

The application uses a multi-stage Docker build to produce a small production image:

```dockerfile
# app/Containerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/instrumentation.mjs ./instrumentation.mjs
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
CMD ["node", "--import", "./instrumentation.mjs", "dist/server/entry.mjs"]
```

## 8.2 Build Stage

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
```

| Step | Purpose |
|------|---------|
| `COPY package.json package-lock.json* ./` | Copy dependency manifests first (Docker cache optimization) |
| `RUN npm ci` | Install all dependencies (including devDependencies for the build) |
| `COPY . .` | Copy application source code |
| `RUN npm run build` | Run `astro build` — produces `dist/` with the compiled application |

The `package-lock.json*` glob ensures the build works whether a lockfile exists or not.

## 8.3 Production Stage

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/instrumentation.mjs ./instrumentation.mjs
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
```

| Step | Purpose |
|------|---------|
| `COPY --from=build /app/dist ./dist` | Copy the compiled Astro output |
| `COPY --from=build /app/instrumentation.mjs` | Copy the OTel bootstrap file |
| `COPY package.json package-lock.json*` | Needed for `npm ci` |
| `RUN npm ci --omit=dev` | Install production dependencies only |

### Why `node_modules` in Production?

Normally, Astro's standalone adapter bundles everything into `dist/server/entry.mjs`. However, this project externalizes `pino` from the Vite bundle:

```javascript
// app/astro.config.mjs
vite: {
  ssr: {
    external: ['pino', 'pino-pretty'],
  },
}
```

Externalized packages are resolved from `node_modules` at runtime, not bundled. Additionally, the OpenTelemetry packages in `instrumentation.mjs` need to be available as runtime dependencies. This is why the production image runs `npm ci --omit=dev`.

## 8.4 The CMD Instruction

```dockerfile
CMD ["node", "--import", "./instrumentation.mjs", "dist/server/entry.mjs"]
```

This starts the Astro production server with OTel instrumentation pre-loaded. The `--import` flag ensures `instrumentation.mjs` executes before any application code, so monkey-patching of `http`, `fetch`, and `pino` happens in time.

## 8.5 Environment Variables

```dockerfile
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
```

| Variable | Value | Purpose |
|----------|-------|---------|
| `HOST` | `0.0.0.0` | Bind to all interfaces (required inside Docker) |
| `PORT` | `4321` | Astro's listening port |
| `EXPOSE` | `4321` | Documents the port (informational only) |

Additional environment variables (`SERVICE_NAME`, `AWS_REGION`, `NODE_ENV`, etc.) are injected by the ECS task definition at runtime — not baked into the image.

## 8.6 Alpine Linux

Both stages use `node:20-alpine`, which is based on Alpine Linux:

| Property | Value |
|----------|-------|
| Base image size | ~50 MB (vs ~350 MB for `node:20`) |
| Package manager | `apk` (not `apt`) |
| C library | `musl` (not `glibc`) |

Alpine is preferred for production because of its small footprint. Native Node.js addons that depend on `glibc` may not work, but this project uses only pure JavaScript dependencies.

## 8.7 Docker Layer Caching

The Containerfile is ordered to maximize Docker layer caching:

```
1. COPY package.json  ← Changes rarely
2. RUN npm ci         ← Cached unless package.json changed
3. COPY . .           ← Changes often (source code)
4. RUN npm run build  ← Rebuilds when source changes
```

If only source code changes (not dependencies), steps 1-2 are cached and only steps 3-4 run. This significantly speeds up rebuilds.

## 8.8 Building for AWS

The deploy script builds the image for `linux/amd64` even on ARM64 Macs:

```bash
# deploy-app.sh
docker build --platform linux/amd64 -f Containerfile -t astro-webui:latest .
```

ECS Fargate runs on `x86_64` (amd64) architecture. The `--platform` flag tells Docker to cross-compile via QEMU emulation. This is slower but ensures the image runs correctly on AWS.

## 8.9 CDK Execution Container

A separate Dockerfile exists for running CDK commands on macOS ARM64:

```dockerfile
# Dockerfile.cdk
FROM eclipse-temurin:21-jdk
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs maven && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
RUN npm install -g aws-cdk
WORKDIR /app
COPY pom.xml .
COPY cdk/pom.xml ./cdk/
COPY cdk/src ./cdk/src
COPY cdk/cdk.json ./cdk/
RUN mvn install -N -q
WORKDIR /app/cdk
RUN mvn dependency:go-offline -q || true
CMD ["cdk", "synth", "--app", "mvn -e -q compile exec:java"]
```

This exists because JSII (the CDK's JavaScript-to-Java bridge) has a bug on macOS ARM64 that causes `.jsii` files to not be found. Running CDK inside a Linux container avoids this issue entirely.

## 8.10 Production Image Contents

The final production image contains:

```
/app/
├── dist/
│   ├── client/           # Static assets (CSS, JS)
│   └── server/
│       └── entry.mjs     # Astro standalone server
├── instrumentation.mjs   # OTel SDK bootstrap
├── node_modules/         # Production dependencies (pino, OTel, AWS SDK)
├── package.json
└── package-lock.json
```

## Summary

| Concept | Implementation |
|---------|---------------|
| Multi-stage build | Build stage compiles, production stage runs |
| Base image | `node:20-alpine` for minimal size |
| Runtime `node_modules` | Required because pino is externalized from the Vite bundle |
| OTel integration | `instrumentation.mjs` copied and loaded via `--import` flag |
| Cross-platform | `--platform linux/amd64` for AWS ECS compatibility |
| CDK container | Separate `Dockerfile.cdk` works around JSII ARM64 bug |
| Layer caching | Dependencies installed before source code copy |
| Environment | `HOST`, `PORT` baked in; other vars injected by ECS |

---

**Previous:** [Lesson 07 — Testing Strategies](07-testing-strategies.md) | **Next:** [Lesson 09 — Infrastructure as Code](09-infrastructure-as-code.md)
