package com.example.infra;

/**
 * Value object representing VPC, ECS cluster, and ALB references.
 */
public record NetworkConfig(String vpcId, String ecsClusterName, String albName) {

    public NetworkConfig {
        if (vpcId == null || vpcId.isBlank()) {
            throw new IllegalArgumentException("vpcId is required");
        }
        if (ecsClusterName == null || ecsClusterName.isBlank()) {
            throw new IllegalArgumentException("ecsClusterName is required");
        }
        if (albName == null || albName.isBlank()) {
            throw new IllegalArgumentException("albName is required");
        }
    }
}
