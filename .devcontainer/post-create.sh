#!/bin/bash
set -e

echo "=========================================="
echo "  Astro WebUI - Codespaces Setup"
echo "=========================================="

# Install AWS CDK CLI
echo "Installing AWS CDK CLI..."
npm install -g aws-cdk

# Install application dependencies
echo ""
echo "Installing application dependencies..."
cd /workspaces/*/app 2>/dev/null || cd app
npm ci
cd ..

# Build CDK project
echo ""
echo "Building CDK project..."
mvn -q install -N
cd cdk && mvn -q dependency:go-offline || true
cd ..

# Verify installations
echo ""
echo "Verifying installed tools..."
echo "Node.js version: $(node -v)"
echo "npm version:     $(npm -v)"
echo "Java version:    $(java -version 2>&1 | head -n 1)"
echo "Maven version:   $(mvn -v | head -n 1)"
echo "AWS CDK version: $(cdk --version)"
echo "AWS CLI version: $(aws --version)"
echo "Docker version:  $(docker --version)"

# Create helpful aliases
echo ""
echo "Setting up aliases..."
cat >> ~/.bashrc << 'EOF'

# Astro WebUI aliases
alias dev='cd app && npm run dev'
alias build='cd app && npm run build'
alias test='cd app && npm test'
alias test-watch='cd app && npm run test:watch'

# AWS LocalStack aliases
alias awslocal='aws --endpoint-url=http://localstack:4566'
alias ssm-list='aws --endpoint-url=http://localstack:4566 ssm get-parameters-by-path --path /astro-webui/ --region eu-west-1'
alias logs-localstack='docker logs -f localstack'
alias logs-jaeger='docker logs -f jaeger'
EOF

echo ""
echo "=========================================="
echo "Setup complete!"
echo ""
echo "Services available:"
echo "  - LocalStack: localstack:4566"
echo "  - Jaeger UI:  http://localhost:16686"
echo ""
echo "Quick start:"
echo "  cd app && npm run dev"
echo ""
echo "Application will be at: http://localhost:4321"
echo "=========================================="
