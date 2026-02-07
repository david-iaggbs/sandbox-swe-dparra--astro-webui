package com.example.infra;

import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

/**
 * CDK Application entry point.
 * Creates the Astro WebUI infrastructure stack.
 *
 * External platform values (awsAccount, vpcId, ecsClusterName, albName) are
 * read from CDK context. Set defaults in cdk.json or override via CLI:
 *   cdk deploy -c vpcId=vpc-xxx -c ecsClusterName=my-cluster -c albName=my-alb
 */
public class CdkApp {

    public static void main(final String[] args) {
        App app = new App();

        // External platform values — from CDK context (cdk.json or --context flags)
        String awsAccount = resolveContext(app, "awsAccount", System.getenv("CDK_DEFAULT_ACCOUNT"));
        String vpcId = requireContext(app, "vpcId");
        String ecsClusterName = requireContext(app, "ecsClusterName");
        String albName = requireContext(app, "albName");

        // Optional overrides with sensible defaults
        String environment = resolveContext(app, "environment", "dev");

        // Build configuration
        InfrastructureConfig config = InfrastructureConfig.builder()
                .awsAccount(awsAccount)
                .environment(environment)
                .vpcId(vpcId)
                .ecsClusterName(ecsClusterName)
                .albName(albName)
                .build();

        // Create the stack
        new AstroWebUiStack(app, "AstroWebUiStack", StackProps.builder()
                .env(Environment.builder()
                        .account(config.getAwsEnvironment().accountId())
                        .region(config.getAwsEnvironment().region())
                        .build())
                .description("Astro WebUI infrastructure - ECS Fargate deployment")
                .build(),
                config);

        app.synth();
    }

    private static String resolveContext(App app, String key, String fallback) {
        String value = (String) app.getNode().tryGetContext(key);
        return value != null ? value : fallback;
    }

    private static String requireContext(App app, String key) {
        String value = (String) app.getNode().tryGetContext(key);
        if (value == null) {
            throw new IllegalStateException(
                    "Required CDK context value '" + key + "' is missing. " +
                    "Set it in cdk.json or pass via: cdk deploy -c " + key + "=<value>");
        }
        return value;
    }
}
