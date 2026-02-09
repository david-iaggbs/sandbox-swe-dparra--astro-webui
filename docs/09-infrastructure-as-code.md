# Lesson 09 — Infrastructure as Code

> **Level:** Intermediate
> **Goal:** Understand how the AWS CDK stack (Java) provisions ECS Fargate infrastructure for the Astro WebUI, including the shared ALB, IAM, SSM parameters, and deployment scripts.

## 9.1 CDK Overview

The infrastructure is defined using [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html) in Java. CDK synthesizes CloudFormation templates from imperative code, giving you type safety, IDE support, and reusable constructs.

```
cdk/
├── src/main/java/com/example/infra/
│   ├── CdkApp.java              # CDK app entry point
│   ├── AstroWebUiStack.java     # Main stack (all resources)
│   ├── InfrastructureConfig.java # Configuration builder
│   ├── AwsEnvironment.java       # Region, account, environment name
│   ├── NetworkConfig.java        # VPC, cluster, ALB references
│   ├── ContainerConfig.java      # Port, CPU, memory, image tag
│   └── RoutingConfig.java        # Path pattern, health check, priority
├── cdk.json                      # CDK context and app command
└── pom.xml                       # Maven dependencies (CDK 2.154.0)
```

## 9.2 Configuration Model

Infrastructure settings are encapsulated in Java records, separating configuration from resource creation:

```java
// AwsEnvironment.java
public record AwsEnvironment(String region, String accountId, String environmentName) {}

// NetworkConfig.java
public record NetworkConfig(String vpcId, String ecsClusterName, String albName) {}

// ContainerConfig.java — defaults: port=4321, cpu=256, memory=512, desiredCount=0
public record ContainerConfig(int port, int cpu, int memoryMiB, int desiredCount, String imageTag) {}

// RoutingConfig.java — defaults: pathPattern="/*", healthCheckPath="/api/health", priority=200
public record RoutingConfig(String pathPattern, String healthCheckPath, int listenerRulePriority) {}
```

`InfrastructureConfig` assembles these records and provides a single object to the stack.

### CDK Context

The entry point reads context values from `cdk.json`:

```json
{
  "app": "mvn -e -q compile exec:java",
  "context": {
    "vpcId": "vpc-0b3af2bd9b0c862d8",
    "ecsClusterName": "ecs-cluster-cluster-dev",
    "albName": "ecs-cluster-alb-dev"
  }
}
```

These reference **existing** shared infrastructure — the CDK stack does not create the VPC, ECS cluster, or ALB.

## 9.3 The Stack — 11 Steps

The `AstroWebUiStack` constructor runs 11 sequential steps. Each step is a private method:

```java
// app/cdk/src/main/java/com/example/infra/AstroWebUiStack.java
public AstroWebUiStack(final Construct scope, final String id,
                       final StackProps props,
                       final InfrastructureConfig config) {
    super(scope, id, props);
    this.config = config;

    lookupExistingInfrastructure();  // Step 1
    createEcrRepository();            // Step 2
    createLogGroup();                 // Step 3
    createIamRoles();                 // Step 4
    createSsmParameters();            // Step 5
    createSecurityGroup();            // Step 6
    createTargetGroup();              // Step 7
    createListenerRule();             // Step 8
    createTaskDefinition();           // Step 9
    createEcsService();               // Step 10
    createOutputs();                  // Step 11
}
```

## 9.4 Step 1 — Lookup Existing Infrastructure

The stack attaches to shared infrastructure rather than creating its own:

```java
vpc = Vpc.fromLookup(this, "ExistingVpc", VpcLookupOptions.builder()
        .vpcId(network.vpcId())
        .build());

ecsCluster = Cluster.fromClusterAttributes(this, "ExistingCluster",
        ClusterAttributes.builder()
                .clusterName(network.ecsClusterName())
                .vpc(vpc)
                .securityGroups(Collections.emptyList())
                .build());

alb = ApplicationLoadBalancer.fromLookup(this, "ExistingAlb",
        ApplicationLoadBalancerLookupOptions.builder()
                .loadBalancerTags(Map.of("Name", network.albName()))
                .build());

httpListener = ApplicationListener.fromLookup(this, "HttpListener",
        ApplicationListenerLookupOptions.builder()
                .loadBalancerArn(alb.getLoadBalancerArn())
                .listenerPort(80)
                .build());
```

| Lookup | Method | Identifier |
|--------|--------|-----------|
| VPC | `Vpc.fromLookup` | VPC ID from context |
| ECS Cluster | `Cluster.fromClusterAttributes` | Cluster name from context |
| ALB | `ApplicationLoadBalancer.fromLookup` | Name tag from context |
| HTTP Listener | `ApplicationListener.fromLookup` | ALB ARN + port 80 |

> **Note:** CDK lookups query your AWS account during `cdk synth` and cache results in `cdk.context.json`. If infrastructure changes, delete this file to force fresh lookups.

## 9.5 Step 4 — IAM Roles (Least Privilege)

Two roles follow the principle of least privilege:

```java
// Task Execution Role — used by ECS agent to pull images and write logs
taskExecutionRole = Role.Builder.create(this, "TaskExecutionRole")
        .roleName(serviceName + "-execution-role")
        .assumedBy(new ServicePrincipal("ecs-tasks.amazonaws.com"))
        .build();
taskExecutionRole.addManagedPolicy(
        ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"));

// Task Role — used by the application for AWS service access
taskRole = Role.Builder.create(this, "TaskRole")
        .roleName(serviceName + "-task-role")
        .assumedBy(new ServicePrincipal("ecs-tasks.amazonaws.com"))
        .build();
taskRole.addToPolicy(PolicyStatement.Builder.create()
        .effect(Effect.ALLOW)
        .actions(List.of("ssm:GetParameter"))
        .resources(List.of(
                "arn:aws:ssm:" + region + ":" + accountId + ":parameter/" + serviceName + "/*"))
        .build());
```

| Role | Who Uses It | Permissions |
|------|-------------|-------------|
| Execution role | ECS agent | Pull ECR images, write CloudWatch logs |
| Task role | Application code | `ssm:GetParameter` on `/{serviceName}/*` only |

The task role is scoped to the service's own SSM parameters — it cannot read parameters belonging to other services.

## 9.6 Step 5 — SSM Parameters

Configuration parameters are created as part of the stack:

```java
StringParameter.Builder.create(this, "ApiBackendUrlParameter")
        .parameterName("/" + serviceName + "/api.backend.url")
        .stringValue("http://" + alb.getLoadBalancerDnsName())
        .description("Backend API base URL for " + serviceName)
        .build();
```

| Parameter | Value | Notes |
|-----------|-------|-------|
| `app.description` | Static text | Application description for UI |
| `api.backend.url` | ALB DNS name | Dynamic — resolved from the shared ALB |
| `api.timeout.ms` | `5000` | Backend request timeout |
| `api.retry.count` | `3` | Retry attempts |
| `log.level` | `info` | Production log level |
| `rate.limit.rpm` | `60` | Rate limit |

The backend URL uses the ALB's DNS name because both the Astro WebUI and the Spring Cloud backend are behind the same ALB, routed by path-based rules.

## 9.7 Step 7 — Target Group with Health Check

```java
targetGroup = ApplicationTargetGroup.Builder.create(this, "ServiceTargetGroup")
        .targetGroupName(serviceName + "-tg")
        .vpc(vpc)
        .port(container.port())
        .protocol(ApplicationProtocol.HTTP)
        .targetType(TargetType.IP)
        .healthCheck(HealthCheck.builder()
                .enabled(true)
                .healthyThresholdCount(2)
                .unhealthyThresholdCount(3)
                .timeout(Duration.seconds(5))
                .interval(Duration.seconds(30))
                .path(routing.healthCheckPath())
                .healthyHttpCodes("200")
                .build())
        .build();
```

The health check hits `/api/health` every 30 seconds. A task is considered healthy after 2 consecutive successes and unhealthy after 3 consecutive failures.

## 9.8 Step 8 — ALB Listener Rule

```java
ApplicationListenerRule.Builder.create(this, "ServiceListenerRule")
        .listener(httpListener)
        .priority(routing.listenerRulePriority())   // 200
        .conditions(Collections.singletonList(
                ListenerCondition.pathPatterns(Collections.singletonList(
                        routing.pathPattern()         // "/*"
                ))
        ))
        .action(ListenerAction.forward(Collections.singletonList(targetGroup)))
        .build();
```

The rule matches `/*` at priority 200. Lower priority numbers are evaluated first — the Spring Cloud backend uses a higher-priority rule (e.g., priority 100 for `/api/v1/*`) to handle its API paths before this catch-all rule.

## 9.9 Step 9 — Task Definition

```java
Map<String, String> environmentVars = new HashMap<>();
environmentVars.put("HOST", "0.0.0.0");
environmentVars.put("PORT", String.valueOf(container.port()));
environmentVars.put("SERVICE_NAME", serviceName);
environmentVars.put("AWS_REGION", config.getAwsEnvironment().region());
environmentVars.put("OTEL_SERVICE_NAME", serviceName);
environmentVars.put("NODE_ENV", "production");
```

| Variable | Value | Purpose |
|----------|-------|---------|
| `HOST` | `0.0.0.0` | Bind to all interfaces |
| `PORT` | `4321` | Container port |
| `SERVICE_NAME` | `astro-webui` | SSM parameter path prefix |
| `AWS_REGION` | `eu-west-1` | AWS SDK region |
| `OTEL_SERVICE_NAME` | `astro-webui` | OTel service identification |
| `NODE_ENV` | `production` | Disables `pino-pretty`, enables production optimizations |

Note that `OTEL_EXPORTER_OTLP_ENDPOINT` is intentionally **not set** — OTel traces are disabled until an ADOT sidecar is added.

## 9.10 Deployment Scripts

### Infrastructure Deployment

```bash
# Deploy infrastructure (use --docker on macOS ARM64)
./deploy-infra.sh --docker
```

The script runs CDK bootstrap (idempotent) followed by `cdk deploy`. The `--docker` flag builds and runs CDK inside a Linux container to work around JSII issues on Apple Silicon.

### Application Deployment

```bash
# Build, push image, and update ECS service
./deploy-app.sh
```

This script:

1. Installs dependencies (`npm ci`)
2. Builds the application (`npm run build`)
3. Builds the Docker image (`docker build --platform linux/amd64`)
4. Authenticates with ECR
5. Tags and pushes the image as `latest`
6. Forces a new ECS deployment
7. Waits for the service to stabilize

### Infrastructure Teardown

```bash
# Destroy all resources (use --docker on macOS ARM64)
./destroy-infra.sh --docker
```

The teardown script first deletes all ECR images (to avoid deletion errors), then runs `cdk destroy --force`.

## 9.11 Stack Outputs

```java
output("EcrRepositoryUrl", "ECR repository URL", ecrRepository.getRepositoryUri(), ...);
output("EcsServiceName", "ECS service name", ecsService.getServiceName(), ...);
output("ServiceUrl", "Service URL", "http://" + alb.getLoadBalancerDnsName() + "/", ...);
```

After deployment, CloudFormation outputs show the ECR URL, service name, task definition ARN, target group ARN, log group name, and the service URL.

> **Further reading:** [AWS CDK Java Reference](https://docs.aws.amazon.com/cdk/api/v2/java/)

## Summary

| Concept | Implementation |
|---------|---------------|
| CDK language | Java 21 with CDK 2.154.0 |
| Shared infrastructure | VPC, ECS cluster, and ALB looked up by context values |
| IAM least privilege | Task role scoped to `ssm:GetParameter` on own parameters |
| SSM parameters | Created as stack resources, backend URL uses ALB DNS |
| Health check | ALB target group checks `/api/health` every 30s |
| Listener rule | `/*` at priority 200 (catch-all behind backend routes) |
| Deployment | `deploy-infra.sh` for CDK, `deploy-app.sh` for application |
| ARM64 workaround | `--docker` flag runs CDK inside Linux container |

---

**Previous:** [Lesson 08 — Containerization](08-containerization.md) | **Next:** [Lesson 10 — Local Development Environment](10-local-development-environment.md)
