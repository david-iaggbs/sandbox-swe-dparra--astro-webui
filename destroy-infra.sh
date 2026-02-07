#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# destroy-infra.sh — Tear down all CDK infrastructure
#
# Usage: ./destroy-infra.sh [--docker]
#   --docker    Use Docker-based CDK execution (workaround for JSII issues on macOS ARM64)
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_DIR="${SCRIPT_DIR}/cdk"

# Parse arguments
USE_DOCKER=false
for arg in "$@"; do
  case $arg in
    --docker|-d)
      USE_DOCKER=true
      shift
      ;;
  esac
done

AWS_PROFILE="sandbox-swe-dparra-admin"
export AWS_PROFILE

AWS_ACCOUNT="${AWS_ACCOUNT:-$(aws sts get-caller-identity --query Account --output text)}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
SERVICE_NAME="${SERVICE_NAME:-astro-webui}"

# Function to run CDK commands (native or Docker)
run_cdk() {
  if [ "${USE_DOCKER}" = true ]; then
    # Build Docker image if needed
    if [[ "$(docker images -q astro-webui-cdk 2>/dev/null)" == "" ]]; then
      echo "==> Building CDK Docker image..."
      docker build -f "${SCRIPT_DIR}/Dockerfile.cdk" -t astro-webui-cdk "${SCRIPT_DIR}"
    fi

    docker run --rm \
      -v "${HOME}/.aws:/root/.aws:ro" \
      -e AWS_PROFILE="${AWS_PROFILE}" \
      -e AWS_REGION="${AWS_REGION}" \
      -e CDK_DEFAULT_ACCOUNT="${AWS_ACCOUNT}" \
      -e CDK_DEFAULT_REGION="${AWS_REGION}" \
      astro-webui-cdk \
      cdk "$@" --app "mvn -e -q compile exec:java"
  else
    cd "${CDK_DIR}"
    npx cdk "$@"
  fi
}

echo "==> Destroying infrastructure (profile: ${AWS_PROFILE})"
echo "    Account : ${AWS_ACCOUNT}"
echo "    Region  : ${AWS_REGION}"
echo "    Docker  : ${USE_DOCKER}"

echo "==> Cleaning ECR images before stack deletion"
IMAGES=$(aws ecr list-images \
  --repository-name "${SERVICE_NAME}" \
  --region "${AWS_REGION}" \
  --query 'imageIds[*]' \
  --output json 2>/dev/null || echo "[]")

if [ "${IMAGES}" != "[]" ] && [ -n "${IMAGES}" ]; then
  aws ecr batch-delete-image \
    --repository-name "${SERVICE_NAME}" \
    --region "${AWS_REGION}" \
    --image-ids "${IMAGES}" \
    --no-cli-pager
  echo "    ECR images deleted"
else
  echo "    No ECR images to delete"
fi

echo "==> Destroying CDK stack"
run_cdk destroy AstroWebUiStack \
  --context awsAccount="${AWS_ACCOUNT}" \
  --force

echo "==> Infrastructure destroyed successfully"
