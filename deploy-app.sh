#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# deploy-app.sh — Build the app, push Docker image, and update the ECS service
#                  Run this every time application code changes.
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

AWS_PROFILE="sandbox-swe-dparra-admin"
export AWS_PROFILE

AWS_ACCOUNT="${AWS_ACCOUNT:-$(aws sts get-caller-identity --query Account --output text)}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
SERVICE_NAME="${SERVICE_NAME:-astro-webui}"
ECS_CLUSTER="${ECS_CLUSTER:-ecs-cluster-cluster-dev}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

ECR_REPO="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/${SERVICE_NAME}"

echo "==> Installing dependencies"
cd "${SCRIPT_DIR}/app"
npm ci

echo "==> Building application"
npm run build

echo "==> Building container image"
docker build --platform linux/amd64 -f Containerfile -t "${SERVICE_NAME}:${IMAGE_TAG}" .

echo "==> Logging into ECR"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "==> Tagging and pushing image"
docker tag "${SERVICE_NAME}:${IMAGE_TAG}" "${ECR_REPO}:${IMAGE_TAG}"
docker push "${ECR_REPO}:${IMAGE_TAG}"

echo "==> Updating ECS service (force new deployment)"
aws ecs update-service \
  --cluster "${ECS_CLUSTER}" \
  --service "${SERVICE_NAME}" \
  --force-new-deployment \
  --desired-count 1 \
  --region "${AWS_REGION}" \
  --no-cli-pager

echo "==> Waiting for service to stabilize..."
aws ecs wait services-stable \
  --cluster "${ECS_CLUSTER}" \
  --services "${SERVICE_NAME}" \
  --region "${AWS_REGION}"

echo "==> Application deployed successfully"
