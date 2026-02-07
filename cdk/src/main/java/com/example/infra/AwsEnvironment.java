package com.example.infra;

/**
 * Value object representing AWS account-level context.
 */
public record AwsEnvironment(String region, String accountId, String environmentName) {

    public AwsEnvironment {
        if (region == null || region.isBlank()) {
            throw new IllegalArgumentException("region is required");
        }
        if (accountId == null || accountId.isBlank()) {
            throw new IllegalArgumentException("accountId is required");
        }
        if (environmentName == null || environmentName.isBlank()) {
            throw new IllegalArgumentException("environmentName is required");
        }
    }
}
