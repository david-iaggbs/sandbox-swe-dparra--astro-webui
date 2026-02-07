#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# deploy-infra.sh — Deploy AWS CDK infrastructure (run once or on infra changes)
#
# Usage: ./deploy-infra.sh [--docker]
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

echo "==> Deploying CDK infrastructure (profile: ${AWS_PROFILE})"
echo "    Account : ${AWS_ACCOUNT}"
echo "    Region  : ${AWS_REGION}"
echo "    Docker  : ${USE_DOCKER}"

# Bootstrap CDK (idempotent — safe to re-run)
run_cdk bootstrap "aws://${AWS_ACCOUNT}/${AWS_REGION}"

# Deploy the stack
run_cdk deploy AstroWebUiStack \
  --context awsAccount="${AWS_ACCOUNT}" \
  --require-approval never

echo "==> Infrastructure deployed successfully"
