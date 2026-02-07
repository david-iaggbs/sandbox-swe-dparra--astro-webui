package com.example.infra;

/**
 * Configuration class for the Astro WebUI infrastructure.
 * Provides type-safe, centralized configuration.
 * Related primitives are grouped into value objects to avoid primitive obsession.
 */
public final class InfrastructureConfig {

    private final String serviceName;
    private final AwsEnvironment awsEnvironment;
    private final NetworkConfig networkConfig;
    private final ContainerConfig containerConfig;
    private final RoutingConfig routingConfig;

    private InfrastructureConfig(Builder builder) {
        this.serviceName = builder.serviceName;
        this.awsEnvironment = new AwsEnvironment(
                builder.awsRegion, builder.awsAccount, builder.environment);
        this.networkConfig = new NetworkConfig(
                builder.vpcId, builder.ecsClusterName, builder.albName);
        this.containerConfig = new ContainerConfig(
                builder.containerPort, builder.containerCpu, builder.containerMemory,
                builder.desiredCount, builder.imageTag);
        this.routingConfig = new RoutingConfig(
                builder.pathPattern, builder.healthCheckPath, builder.listenerRulePriority);
    }

    public String getServiceName() {
        return serviceName;
    }

    public AwsEnvironment getAwsEnvironment() {
        return awsEnvironment;
    }

    public NetworkConfig getNetworkConfig() {
        return networkConfig;
    }

    public ContainerConfig getContainerConfig() {
        return containerConfig;
    }

    public RoutingConfig getRoutingConfig() {
        return routingConfig;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String awsRegion = "eu-west-1";
        private String awsAccount;
        private String environment = "dev";
        private String serviceName = "astro-webui";
        private String vpcId;
        private String ecsClusterName;
        private String albName;
        private int containerPort = 4321;
        private int containerCpu = 256;
        private int containerMemory = 512;
        private int desiredCount = 0;
        private String pathPattern = "/*";
        private String healthCheckPath = "/api/health";
        private String imageTag = "latest";
        private int listenerRulePriority = 200;

        public Builder awsRegion(String awsRegion) {
            this.awsRegion = awsRegion;
            return this;
        }

        public Builder awsAccount(String awsAccount) {
            this.awsAccount = awsAccount;
            return this;
        }

        public Builder environment(String environment) {
            this.environment = environment;
            return this;
        }

        public Builder serviceName(String serviceName) {
            this.serviceName = serviceName;
            return this;
        }

        public Builder vpcId(String vpcId) {
            this.vpcId = vpcId;
            return this;
        }

        public Builder ecsClusterName(String ecsClusterName) {
            this.ecsClusterName = ecsClusterName;
            return this;
        }

        public Builder albName(String albName) {
            this.albName = albName;
            return this;
        }

        public Builder containerPort(int containerPort) {
            this.containerPort = containerPort;
            return this;
        }

        public Builder containerCpu(int containerCpu) {
            this.containerCpu = containerCpu;
            return this;
        }

        public Builder containerMemory(int containerMemory) {
            this.containerMemory = containerMemory;
            return this;
        }

        public Builder desiredCount(int desiredCount) {
            this.desiredCount = desiredCount;
            return this;
        }

        public Builder pathPattern(String pathPattern) {
            this.pathPattern = pathPattern;
            return this;
        }

        public Builder healthCheckPath(String healthCheckPath) {
            this.healthCheckPath = healthCheckPath;
            return this;
        }

        public Builder imageTag(String imageTag) {
            this.imageTag = imageTag;
            return this;
        }

        public Builder listenerRulePriority(int listenerRulePriority) {
            this.listenerRulePriority = listenerRulePriority;
            return this;
        }

        public InfrastructureConfig build() {
            if (serviceName == null) {
                throw new IllegalStateException("serviceName is required");
            }
            return new InfrastructureConfig(this);
        }
    }
}
