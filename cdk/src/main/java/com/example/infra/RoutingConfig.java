package com.example.infra;

/**
 * Value object representing ALB routing and health check settings.
 */
public record RoutingConfig(String pathPattern, String healthCheckPath, int listenerRulePriority) {

    public RoutingConfig {
        if (pathPattern == null || pathPattern.isBlank()) {
            throw new IllegalArgumentException("pathPattern is required");
        }
        if (healthCheckPath == null || healthCheckPath.isBlank()) {
            throw new IllegalArgumentException("healthCheckPath is required");
        }
    }
}
