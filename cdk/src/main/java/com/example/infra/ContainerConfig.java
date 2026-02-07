package com.example.infra;

/**
 * Value object representing container resource settings.
 */
public record ContainerConfig(int port, int cpu, int memoryMiB, int desiredCount, String imageTag) {

    public ContainerConfig {
        if (imageTag == null || imageTag.isBlank()) {
            throw new IllegalArgumentException("imageTag is required");
        }
    }
}
