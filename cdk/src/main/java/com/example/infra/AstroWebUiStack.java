package com.example.infra;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.ec2.IVpc;
import software.amazon.awscdk.services.ec2.Peer;
import software.amazon.awscdk.services.ec2.Port;
import software.amazon.awscdk.services.ec2.SecurityGroup;
import software.amazon.awscdk.services.ec2.SubnetSelection;
import software.amazon.awscdk.services.ec2.SubnetType;
import software.amazon.awscdk.services.ec2.Vpc;
import software.amazon.awscdk.services.ec2.VpcLookupOptions;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.TagMutability;
import software.amazon.awscdk.services.ecs.AwsLogDriverProps;
import software.amazon.awscdk.services.ecs.Cluster;
import software.amazon.awscdk.services.ecs.ClusterAttributes;
import software.amazon.awscdk.services.ecs.ContainerDefinitionOptions;
import software.amazon.awscdk.services.ecs.ContainerImage;
import software.amazon.awscdk.services.ecs.FargateService;
import software.amazon.awscdk.services.ecs.FargateTaskDefinition;
import software.amazon.awscdk.services.ecs.ICluster;
import software.amazon.awscdk.services.ecs.LogDriver;
import software.amazon.awscdk.services.ecs.PortMapping;
import software.amazon.awscdk.services.ecs.Protocol;
import software.amazon.awscdk.services.elasticloadbalancingv2.ApplicationListener;
import software.amazon.awscdk.services.elasticloadbalancingv2.ApplicationListenerLookupOptions;
import software.amazon.awscdk.services.elasticloadbalancingv2.ApplicationListenerRule;
import software.amazon.awscdk.services.elasticloadbalancingv2.ApplicationLoadBalancer;
import software.amazon.awscdk.services.elasticloadbalancingv2.ApplicationLoadBalancerLookupOptions;
import software.amazon.awscdk.services.elasticloadbalancingv2.ApplicationProtocol;
import software.amazon.awscdk.services.elasticloadbalancingv2.ApplicationTargetGroup;
import software.amazon.awscdk.services.elasticloadbalancingv2.IApplicationListener;
import software.amazon.awscdk.services.elasticloadbalancingv2.IApplicationLoadBalancer;
import software.amazon.awscdk.services.elasticloadbalancingv2.ListenerAction;
import software.amazon.awscdk.services.elasticloadbalancingv2.ListenerCondition;
import software.amazon.awscdk.services.elasticloadbalancingv2.TargetType;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.ssm.StringParameter;
import software.constructs.Construct;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Main CDK Stack for Astro WebUI.
 * Creates ECS Fargate infrastructure for a frontend SSR application.
 */
public class AstroWebUiStack extends Stack {

    private final InfrastructureConfig config;

    // Existing infrastructure references
    private IVpc vpc;
    private ICluster ecsCluster;
    private IApplicationLoadBalancer alb;
    private IApplicationListener httpListener;

    // Created resources
    private Repository ecrRepository;
    private LogGroup logGroup;
    private Role taskExecutionRole;
    private Role taskRole;
    private SecurityGroup serviceSecurityGroup;
    private ApplicationTargetGroup targetGroup;
    private FargateTaskDefinition taskDefinition;
    private FargateService ecsService;

    public AstroWebUiStack(final Construct scope, final String id,
                           final StackProps props,
                           final InfrastructureConfig config) {
        super(scope, id, props);
        this.config = config;

        // Step 1: Lookup existing infrastructure
        lookupExistingInfrastructure();

        // Step 2: Create ECR Repository
        createEcrRepository();

        // Step 3: Create CloudWatch Log Group
        createLogGroup();

        // Step 4: Create IAM Roles
        createIamRoles();

        // Step 5: Create SSM Parameters
        createSsmParameters();

        // Step 6: Create Security Group
        createSecurityGroup();

        // Step 7: Create ALB Target Group
        createTargetGroup();

        // Step 8: Create ALB Listener Rule
        createListenerRule();

        // Step 9: Create ECS Task Definition
        createTaskDefinition();

        // Step 10: Create ECS Service
        createEcsService();

        // Step 11: Create Stack Outputs
        createOutputs();
    }

    /**
     * Step 1: Lookup existing VPC, ECS Cluster, ALB, and HTTP Listener.
     */
    private void lookupExistingInfrastructure() {
        NetworkConfig network = config.getNetworkConfig();

        // Lookup VPC by ID
        vpc = Vpc.fromLookup(this, "ExistingVpc", VpcLookupOptions.builder()
                .vpcId(network.vpcId())
                .build());

        // Lookup ECS Cluster by cluster name
        ecsCluster = Cluster.fromClusterAttributes(this, "ExistingCluster",
                ClusterAttributes.builder()
                        .clusterName(network.ecsClusterName())
                        .vpc(vpc)
                        .securityGroups(Collections.emptyList())
                        .build());

        // Lookup ALB by tags
        alb = ApplicationLoadBalancer.fromLookup(this, "ExistingAlb",
                ApplicationLoadBalancerLookupOptions.builder()
                        .loadBalancerTags(Map.of("Name", network.albName()))
                        .build());

        // Lookup HTTP Listener (port 80)
        httpListener = ApplicationListener.fromLookup(this, "HttpListener",
                ApplicationListenerLookupOptions.builder()
                        .loadBalancerArn(alb.getLoadBalancerArn())
                        .listenerPort(80)
                        .build());
    }

    /**
     * Step 2: Create ECR Repository with image scanning enabled.
     */
    private void createEcrRepository() {
        String serviceName = config.getServiceName();
        String env = config.getAwsEnvironment().environmentName();

        ecrRepository = Repository.Builder.create(this, "ServiceRepository")
                .repositoryName(serviceName)
                .imageScanOnPush(true)
                .imageTagMutability(TagMutability.MUTABLE)
                .removalPolicy(RemovalPolicy.DESTROY)
                .emptyOnDelete(true)
                .build();

        Tags.of(ecrRepository).add("Name", serviceName);
        Tags.of(ecrRepository).add("Environment", env);
    }

    /**
     * Step 3: Create CloudWatch Log Group with 30-day retention.
     */
    private void createLogGroup() {
        String serviceName = config.getServiceName();
        String env = config.getAwsEnvironment().environmentName();

        logGroup = LogGroup.Builder.create(this, "ServiceLogGroup")
                .logGroupName("/ecs/" + serviceName)
                .retention(RetentionDays.ONE_MONTH)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        Tags.of(logGroup).add("Name", serviceName);
        Tags.of(logGroup).add("Environment", env);
    }

    /**
     * Step 4: Create IAM Execution Role and Task Role.
     */
    private void createIamRoles() {
        String serviceName = config.getServiceName();
        String env = config.getAwsEnvironment().environmentName();

        // ECS Task Execution Role - for pulling images and writing logs
        taskExecutionRole = Role.Builder.create(this, "TaskExecutionRole")
                .roleName(serviceName + "-execution-role")
                .assumedBy(new ServicePrincipal("ecs-tasks.amazonaws.com"))
                .description("ECS Task Execution Role for " + serviceName)
                .build();

        taskExecutionRole.addManagedPolicy(
                ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"));

        Tags.of(taskExecutionRole).add("Name", serviceName + "-execution-role");
        Tags.of(taskExecutionRole).add("Environment", env);

        // ECS Task Role - for application-level AWS service access
        taskRole = Role.Builder.create(this, "TaskRole")
                .roleName(serviceName + "-task-role")
                .assumedBy(new ServicePrincipal("ecs-tasks.amazonaws.com"))
                .description("ECS Task Role for " + serviceName)
                .build();

        taskRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("ssm:GetParameter"))
                .resources(List.of(
                        "arn:aws:ssm:" + config.getAwsEnvironment().region()
                        + ":" + config.getAwsEnvironment().accountId()
                        + ":parameter/" + serviceName + "/*"))
                .build());

        Tags.of(taskRole).add("Name", serviceName + "-task-role");
        Tags.of(taskRole).add("Environment", env);
    }

    /**
     * Step 5: Create SSM Parameter Store entries for application configuration.
     */
    private void createSsmParameters() {
        String serviceName = config.getServiceName();

        StringParameter.Builder.create(this, "AppDescriptionParameter")
                .parameterName("/" + serviceName + "/app.description")
                .stringValue("This application manages a greeting service. "
                        + "You can create new greetings, look up existing ones by ID, "
                        + "delete greetings, and browse all stored messages. "
                        + "It communicates with the Spring Cloud Service API backend.")
                .description("Application description for " + serviceName)
                .build();

        StringParameter.Builder.create(this, "ApiBackendUrlParameter")
                .parameterName("/" + serviceName + "/api.backend.url")
                .stringValue("http://" + alb.getLoadBalancerDnsName())
                .description("Backend API base URL for " + serviceName)
                .build();

        StringParameter.Builder.create(this, "ApiTimeoutMsParameter")
                .parameterName("/" + serviceName + "/api.timeout.ms")
                .stringValue("5000")
                .description("Backend API request timeout in milliseconds")
                .build();

        StringParameter.Builder.create(this, "ApiRetryCountParameter")
                .parameterName("/" + serviceName + "/api.retry.count")
                .stringValue("3")
                .description("Backend API request retry count")
                .build();

        StringParameter.Builder.create(this, "LogLevelParameter")
                .parameterName("/" + serviceName + "/log.level")
                .stringValue("info")
                .description("Application log level")
                .build();

        StringParameter.Builder.create(this, "RateLimitRpmParameter")
                .parameterName("/" + serviceName + "/rate.limit.rpm")
                .stringValue("60")
                .description("Rate limit in requests per minute")
                .build();
    }

    /**
     * Step 6: Create Security Group allowing traffic from ALB.
     */
    private void createSecurityGroup() {
        String serviceName = config.getServiceName();
        String env = config.getAwsEnvironment().environmentName();
        int port = config.getContainerConfig().port();

        serviceSecurityGroup = SecurityGroup.Builder.create(this, "ServiceSecurityGroup")
                .securityGroupName(serviceName + "-sg")
                .description("Security group for " + serviceName + " ECS service")
                .vpc(vpc)
                .allowAllOutbound(true)
                .build();

        // Allow inbound traffic from VPC CIDR on container port
        serviceSecurityGroup.addIngressRule(
                Peer.ipv4(vpc.getVpcCidrBlock()),
                Port.tcp(port),
                "Allow traffic from VPC (ALB)");

        Tags.of(serviceSecurityGroup).add("Name", serviceName + "-sg");
        Tags.of(serviceSecurityGroup).add("Environment", env);
    }

    /**
     * Step 7: Create ALB Target Group with health check.
     */
    private void createTargetGroup() {
        String serviceName = config.getServiceName();
        String env = config.getAwsEnvironment().environmentName();
        ContainerConfig container = config.getContainerConfig();
        RoutingConfig routing = config.getRoutingConfig();

        targetGroup = ApplicationTargetGroup.Builder.create(this, "ServiceTargetGroup")
                .targetGroupName(serviceName + "-tg")
                .vpc(vpc)
                .port(container.port())
                .protocol(ApplicationProtocol.HTTP)
                .targetType(TargetType.IP)
                .healthCheck(software.amazon.awscdk.services.elasticloadbalancingv2.HealthCheck.builder()
                        .enabled(true)
                        .healthyThresholdCount(2)
                        .unhealthyThresholdCount(3)
                        .timeout(Duration.seconds(5))
                        .interval(Duration.seconds(30))
                        .path(routing.healthCheckPath())
                        .protocol(software.amazon.awscdk.services.elasticloadbalancingv2.Protocol.HTTP)
                        .healthyHttpCodes("200")
                        .build())
                .build();

        Tags.of(targetGroup).add("Name", serviceName + "-tg");
        Tags.of(targetGroup).add("Environment", env);
    }

    /**
     * Step 8: Create ALB Listener Rule for path-based routing.
     */
    private void createListenerRule() {
        RoutingConfig routing = config.getRoutingConfig();

        ApplicationListenerRule.Builder
                .create(this, "ServiceListenerRule")
                .listener(httpListener)
                .priority(routing.listenerRulePriority())
                .conditions(Collections.singletonList(
                        ListenerCondition.pathPatterns(Collections.singletonList(
                                routing.pathPattern()
                        ))
                ))
                .action(ListenerAction.forward(Collections.singletonList(targetGroup)))
                .build();
    }

    /**
     * Step 9: Create ECS Fargate Task Definition.
     */
    private void createTaskDefinition() {
        String serviceName = config.getServiceName();
        String env = config.getAwsEnvironment().environmentName();
        ContainerConfig container = config.getContainerConfig();

        taskDefinition = FargateTaskDefinition.Builder.create(this, "ServiceTaskDefinition")
                .family(serviceName)
                .cpu(container.cpu())
                .memoryLimitMiB(container.memoryMiB())
                .executionRole(taskExecutionRole)
                .taskRole(taskRole)
                .build();

        // Environment variables for the Astro SSR container
        Map<String, String> environmentVars = new HashMap<>();
        environmentVars.put("HOST", "0.0.0.0");
        environmentVars.put("PORT", String.valueOf(container.port()));
        environmentVars.put("SERVICE_NAME", serviceName);
        environmentVars.put("AWS_REGION", config.getAwsEnvironment().region());
        environmentVars.put("OTEL_SERVICE_NAME", serviceName);
        environmentVars.put("NODE_ENV", "production");

        taskDefinition.addContainer("ServiceContainer",
                ContainerDefinitionOptions.builder()
                        .containerName(serviceName)
                        .image(ContainerImage.fromEcrRepository(ecrRepository, container.imageTag()))
                        .essential(true)
                        .environment(environmentVars)
                        .logging(LogDriver.awsLogs(AwsLogDriverProps.builder()
                                .logGroup(logGroup)
                                .streamPrefix("ecs")
                                .build()))
                        .portMappings(Collections.singletonList(PortMapping.builder()
                                .containerPort(container.port())
                                .hostPort(container.port())
                                .protocol(Protocol.TCP)
                                .build()))
                        .build());

        Tags.of(taskDefinition).add("Name", serviceName);
        Tags.of(taskDefinition).add("Environment", env);
    }

    /**
     * Step 10: Create ECS Fargate Service.
     */
    private void createEcsService() {
        String serviceName = config.getServiceName();
        String env = config.getAwsEnvironment().environmentName();

        ecsService = FargateService.Builder.create(this, "Service")
                .serviceName(serviceName)
                .cluster(ecsCluster)
                .taskDefinition(taskDefinition)
                .desiredCount(config.getContainerConfig().desiredCount())
                .assignPublicIp(true)
                .securityGroups(Collections.singletonList(serviceSecurityGroup))
                .vpcSubnets(SubnetSelection.builder()
                        .subnetType(SubnetType.PUBLIC)
                        .build())
                .healthCheckGracePeriod(Duration.seconds(60))
                .build();

        // Register service with target group
        ecsService.attachToApplicationTargetGroup(targetGroup);

        Tags.of(ecsService).add("Name", serviceName);
        Tags.of(ecsService).add("Environment", env);
    }

    /**
     * Step 11: Create CloudFormation Outputs.
     */
    private void createOutputs() {
        String serviceName = config.getServiceName();
        RoutingConfig routing = config.getRoutingConfig();

        output("EcrRepositoryUrl", "ECR repository URL for the service",
                ecrRepository.getRepositoryUri(), serviceName + "-ecr-url");
        output("EcsServiceName", "Name of the ECS service",
                ecsService.getServiceName(), serviceName + "-service-name");
        output("EcsTaskDefinitionArn", "ARN of the ECS task definition",
                taskDefinition.getTaskDefinitionArn(), serviceName + "-task-def-arn");
        output("TargetGroupArn", "ARN of the ALB target group",
                targetGroup.getTargetGroupArn(), serviceName + "-target-group-arn");
        output("CloudWatchLogGroup", "CloudWatch log group name",
                logGroup.getLogGroupName(), serviceName + "-log-group");
        output("ServiceUrl", "URL to access the service",
                "http://" + alb.getLoadBalancerDnsName() + "/", serviceName + "-url");
    }

    private void output(String id, String description, String value, String exportName) {
        new CfnOutput(this, id, CfnOutputProps.builder()
                .description(description)
                .value(value)
                .exportName(exportName)
                .build());
    }
}
