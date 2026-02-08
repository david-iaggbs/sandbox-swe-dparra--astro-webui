#!/bin/bash
set -e

# ==============================================================================
# deploy-local-app.sh - Run and debug Astro WebUI locally
# ==============================================================================
#
# This script starts the local development environment with:
# - LocalStack for AWS services emulation (SSM Parameter Store)
#
# Usage:
#   ./deploy-local-app.sh [command]
#
# Commands:
#   start        Start LocalStack containers and run with SSM config (default)
#   start-simple Start dev server without AWS emulation
#   stop         Stop all containers
#   restart      Restart containers and application
#   logs         Show LocalStack initialization logs
#   status       Show container status
#   aws          Show LocalStack AWS resources
#   clean        Stop containers and remove volumes
#
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${SCRIPT_DIR}/app"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Install dependencies if needed
install_deps() {
    if [ ! -d "${APP_DIR}/node_modules" ]; then
        log_info "Installing dependencies..."
        cd "${APP_DIR}"
        npm install
        log_success "Dependencies installed"
    fi
}

# Start containers
start_containers() {
    log_info "Starting LocalStack container..."
    cd "${SCRIPT_DIR}"
    docker-compose up -d

    log_info "Waiting for LocalStack to be healthy..."

    local retries=30
    while ! curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; do
        retries=$((retries - 1))
        if [ $retries -le 0 ]; then
            log_error "LocalStack failed to start"
            exit 1
        fi
        sleep 1
    done
    log_success "LocalStack is ready"

    # Show LocalStack logs to confirm initialization
    log_info "LocalStack initialization logs:"
    docker-compose logs localstack 2>&1 | grep -E "(Created|initialized|Ready|SSM)" | tail -10
}

# Stop containers
stop_containers() {
    log_info "Stopping containers..."
    cd "${SCRIPT_DIR}"
    docker-compose down
    log_success "Containers stopped"
}

# Show container status
show_status() {
    cd "${SCRIPT_DIR}"
    log_info "Container status:"
    docker-compose ps
    echo ""
    log_info "LocalStack health:"
    curl -s http://localhost:4566/_localstack/health | jq . 2>/dev/null || echo "LocalStack not running"
}

# Show LocalStack logs
show_logs() {
    cd "${SCRIPT_DIR}"
    log_info "LocalStack logs:"
    docker-compose logs -f localstack
}

# Show AWS resources in LocalStack
show_aws_resources() {
    log_info "SSM Parameter Store parameters:"
    docker exec localstack awslocal ssm get-parameters-by-path \
        --path "/astro-webui/" \
        --region eu-west-1 2>/dev/null | jq . || echo "No parameters found"
}

# Run the application with LocalStack
run_app_localstack() {
    install_deps
    log_info "Running application with LocalStack SSM..."
    echo ""
    echo "=========================================="
    echo "  Application URL: http://localhost:4321"
    echo "  Health check:    http://localhost:4321/api/health"
    echo "  Config endpoint: http://localhost:4321/api/config"
    echo "=========================================="
    echo ""

    export AWS_SSM_ENDPOINT="http://localhost:4566"
    export AWS_REGION="eu-west-1"
    log_info "LocalStack environment variables set"

    cd "${APP_DIR}"
    npm run dev
}

# Run the application without AWS emulation
run_app_simple() {
    install_deps
    log_info "Running application (no AWS emulation)..."
    echo ""
    echo "=========================================="
    echo "  Application URL: http://localhost:4321"
    echo "  Health check:    http://localhost:4321/api/health"
    echo "=========================================="
    echo ""

    cd "${APP_DIR}"
    npm run dev
}

# Clean up everything
clean_all() {
    log_warn "This will stop containers, remove volumes, node_modules, and build artifacts!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Stopping containers and removing volumes..."
        cd "${SCRIPT_DIR}"
        docker-compose down -v 2>/dev/null || true
        rm -rf "${APP_DIR}/node_modules" "${APP_DIR}/dist"
        log_success "Cleanup complete"
    else
        log_info "Cleanup cancelled"
    fi
}

# Print usage
print_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start        Start LocalStack and run with SSM config (default)"
    echo "  start-simple Start dev server without AWS emulation"
    echo "  stop         Stop all containers"
    echo "  restart      Restart containers and application"
    echo "  logs         Show LocalStack initialization logs"
    echo "  status       Show container status"
    echo "  aws          Show LocalStack AWS resources"
    echo "  clean        Stop containers and remove volumes"
    echo ""
    echo "Examples:"
    echo "  $0              # Start with LocalStack (SSM Parameter Store)"
    echo "  $0 start-simple # Start without AWS emulation"
    echo "  $0 aws          # View AWS resources in LocalStack"
}

# Main
main() {
    local command="${1:-start}"

    case "$command" in
        start)
            check_docker
            start_containers
            run_app_localstack
            ;;
        start-simple)
            run_app_simple
            ;;
        stop)
            stop_containers
            ;;
        restart)
            check_docker
            stop_containers
            start_containers
            run_app_localstack
            ;;
        logs)
            show_logs
            ;;
        status)
            show_status
            ;;
        aws)
            show_aws_resources
            ;;
        clean)
            clean_all
            ;;
        help|--help|-h)
            print_usage
            ;;
        *)
            log_error "Unknown command: $command"
            print_usage
            exit 1
            ;;
    esac
}

main "$@"
