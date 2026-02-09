#!/bin/bash
# ==============================================================================
# LocalStack initialization script
# Seeds SSM Parameter Store with configuration for local development
# ==============================================================================

echo "==> Initializing SSM parameters for astro-webui..."

SERVICE_NAME="astro-webui"
REGION="eu-west-1"

awslocal ssm put-parameter \
  --name "/${SERVICE_NAME}/app.description" \
  --value "This application manages a greeting service. You can create new greetings, look up existing ones by ID, delete greetings, and browse all stored messages. It communicates with the Spring Cloud Service API backend. (Loaded from SSM Parameter Store)" \
  --type String \
  --region "${REGION}" \
  --overwrite

awslocal ssm put-parameter \
  --name "/${SERVICE_NAME}/api.backend.url" \
  --value "http://localhost:8080" \
  --type String \
  --region "${REGION}" \
  --overwrite

awslocal ssm put-parameter \
  --name "/${SERVICE_NAME}/api.timeout.ms" \
  --value "5000" \
  --type String \
  --region "${REGION}" \
  --overwrite

awslocal ssm put-parameter \
  --name "/${SERVICE_NAME}/api.retry.count" \
  --value "3" \
  --type String \
  --region "${REGION}" \
  --overwrite

awslocal ssm put-parameter \
  --name "/${SERVICE_NAME}/log.level" \
  --value "debug" \
  --type String \
  --region "${REGION}" \
  --overwrite

awslocal ssm put-parameter \
  --name "/${SERVICE_NAME}/rate.limit.rpm" \
  --value "60" \
  --type String \
  --region "${REGION}" \
  --overwrite

echo "==> SSM parameters initialized:"
awslocal ssm get-parameters-by-path \
  --path "/${SERVICE_NAME}/" \
  --region "${REGION}"
