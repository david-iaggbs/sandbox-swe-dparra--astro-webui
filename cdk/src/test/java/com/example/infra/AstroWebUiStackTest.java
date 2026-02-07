package com.example.infra;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Template;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class AstroWebUiStackTest {

    private static final String DEFAULT_ACCOUNT = "123456789012";
    private static final String DEFAULT_REGION = "eu-west-1";
    private static final String DEFAULT_SERVICE_NAME = "astro-webui";
    private static final String DEFAULT_VPC_ID = "vpc-12345678";
    private static final String DEFAULT_CLUSTER_NAME = "test-cluster";
    private static final String DEFAULT_ALB_NAME = "test-alb";

    @Test
    void givenDefaultConfig_whenStackSynthesized_thenAllExpectedResourcesAreCreated() {
        Template template = createTemplateWithDefaultConfig();

        template.hasResource("AWS::ECR::Repository", Map.of(
                "Properties", Map.of(
                        "RepositoryName", DEFAULT_SERVICE_NAME,
                        "ImageScanningConfiguration", Map.of("ScanOnPush", true)
                )
        ));

        template.hasResource("AWS::Logs::LogGroup", Map.of(
                "Properties", Map.of(
                        "LogGroupName", "/ecs/" + DEFAULT_SERVICE_NAME,
                        "RetentionInDays", 30
                )
        ));

        template.hasResourceProperties("AWS::IAM::Role", Map.of(
                "RoleName", DEFAULT_SERVICE_NAME + "-execution-role"
        ));

        template.hasResourceProperties("AWS::IAM::Role", Map.of(
                "RoleName", DEFAULT_SERVICE_NAME + "-task-role"
        ));

        template.hasResourceProperties("AWS::EC2::SecurityGroup", Map.of(
                "GroupName", DEFAULT_SERVICE_NAME + "-sg"
        ));

        template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", Map.of(
                "Name", DEFAULT_SERVICE_NAME + "-tg",
                "Port", 4321,
                "Protocol", "HTTP",
                "TargetType", "ip"
        ));

        template.hasResourceProperties("AWS::ECS::TaskDefinition", Map.of(
                "Family", DEFAULT_SERVICE_NAME,
                "Cpu", "256",
                "Memory", "512",
                "NetworkMode", "awsvpc",
                "RequiresCompatibilities", List.of("FARGATE")
        ));

        template.hasResourceProperties("AWS::ECS::Service", Map.of(
                "ServiceName", DEFAULT_SERVICE_NAME,
                "DesiredCount", 0,
                "LaunchType", "FARGATE"
        ));
    }

    @Test
    void givenRequiredValues_whenConfigBuilt_thenRequiredValuesAreSet() {
        InfrastructureConfig config = defaultConfigBuilder().build();

        assertNotNull(config);
        assertEquals(DEFAULT_ACCOUNT, config.getAwsEnvironment().accountId());
        assertEquals(DEFAULT_VPC_ID, config.getNetworkConfig().vpcId());
        assertEquals(DEFAULT_CLUSTER_NAME, config.getNetworkConfig().ecsClusterName());
        assertEquals(DEFAULT_ALB_NAME, config.getNetworkConfig().albName());
    }

    @Test
    void givenOnlyRequiredValues_whenConfigBuilt_thenDefaultValuesAreApplied() {
        InfrastructureConfig config = defaultConfigBuilder().build();

        assertEquals(DEFAULT_REGION, config.getAwsEnvironment().region());
        assertEquals("dev", config.getAwsEnvironment().environmentName());
        assertEquals(DEFAULT_SERVICE_NAME, config.getServiceName());
        assertEquals(4321, config.getContainerConfig().port());
        assertEquals(256, config.getContainerConfig().cpu());
        assertEquals(512, config.getContainerConfig().memoryMiB());
        assertEquals(0, config.getContainerConfig().desiredCount());
        assertEquals("latest", config.getContainerConfig().imageTag());
        assertEquals("/*", config.getRoutingConfig().pathPattern());
        assertEquals("/api/health", config.getRoutingConfig().healthCheckPath());
        assertEquals(200, config.getRoutingConfig().listenerRulePriority());
    }

    @Test
    void givenDefaultConfig_whenStackSynthesized_thenListenerRuleIsCreated() {
        Template template = createTemplateWithDefaultConfig();

        template.resourceCountIs("AWS::ElasticLoadBalancingV2::ListenerRule", 1);
    }

    @Test
    void givenDefaultConfig_whenStackSynthesized_thenNoBackendResourcesAreCreated() {
        Template template = createTemplateWithDefaultConfig();

        // Frontend stack should not have database, SQS, EventBridge, or AppConfig resources
        template.resourceCountIs("AWS::RDS::DBInstance", 0);
        template.resourceCountIs("AWS::SQS::Queue", 0);
        template.resourceCountIs("AWS::Events::Rule", 0);
        template.resourceCountIs("AWS::AppConfig::Application", 0);
        template.resourceCountIs("AWS::DynamoDB::Table", 0);
    }

    private InfrastructureConfig.Builder defaultConfigBuilder() {
        return InfrastructureConfig.builder()
                .awsAccount(DEFAULT_ACCOUNT)
                .awsRegion(DEFAULT_REGION)
                .vpcId(DEFAULT_VPC_ID)
                .ecsClusterName(DEFAULT_CLUSTER_NAME)
                .albName(DEFAULT_ALB_NAME);
    }

    private Template createTemplateWithDefaultConfig() {
        return createTemplate(defaultConfigBuilder().build());
    }

    private Template createTemplate(InfrastructureConfig config) {
        App app = new App();
        AstroWebUiStack stack = new AstroWebUiStack(app, "TestStack",
                StackProps.builder()
                        .env(Environment.builder()
                                .account(config.getAwsEnvironment().accountId())
                                .region(config.getAwsEnvironment().region())
                                .build())
                        .build(),
                config);
        return Template.fromStack(stack);
    }
}
