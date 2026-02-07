#!/bin/bash
set -e

# ==============================================================================
# deploy-local-app.sh - Run and debug Astro WebUI locally
# ==============================================================================
#
# Usage:
#   ./deploy-local-app.sh [command]
#
# Commands:
#   start     Start the dev server (default)
#   build     Build and preview the production build
#   stop      Stop Docker containers (if running)
#   clean     Remove node_modules and build artifacts
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

# Install dependencies if needed
install_deps() {
    if [ ! -d "${APP_DIR}/node_modules" ]; then
        log_info "Installing dependencies..."
        cd "${APP_DIR}"
        npm install
        log_success "Dependencies installed"
    fi
}

# Start dev server
start_dev() {
    install_deps
    log_info "Starting Astro dev server..."
    echo ""
    echo "=========================================="
    echo "  Application URL: http://localhost:4321"
    echo "  Health check:    http://localhost:4321/api/health"
    echo "=========================================="
    echo ""
    cd "${APP_DIR}"
    npm run dev
}

# Build and preview production build
build_preview() {
    install_deps
    log_info "Building production bundle..."
    cd "${APP_DIR}"
    npm run build
    log_success "Build complete"
    echo ""
    echo "=========================================="
    echo "  Preview URL: http://localhost:4321"
    echo "  Health check: http://localhost:4321/api/health"
    echo "=========================================="
    echo ""
    npm run preview
}

# Clean up
clean_all() {
    log_warn "This will remove node_modules and build artifacts!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up..."
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
    echo "  start     Start the dev server (default)"
    echo "  build     Build and preview the production build"
    echo "  clean     Remove node_modules and build artifacts"
    echo ""
    echo "Examples:"
    echo "  $0           # Start dev server"
    echo "  $0 build     # Build and preview production"
}

# Main
main() {
    local command="${1:-start}"

    case "$command" in
        start)
            start_dev
            ;;
        build)
            build_preview
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
