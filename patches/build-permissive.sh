#!/bin/bash
echo "🔧 Building with permissive TypeScript settings..."

# Add more debugging
set -x

# Create environment with declaration skipping
export SKIP_DECLARATIONS=true

# Build core first (allow declaration files)
echo "Building core package..."
pnpm --filter @elizaos/core build || exit 1

# Build other packages with their own commands (this will run from the project root)
echo "Building client-direct package..."
pnpm --filter @elizaos/client-direct run build || echo "⚠️ client-direct build failed partially"

echo "Building client-telegram package..."
pnpm --filter @elizaos/client-telegram run build || echo "⚠️ client-telegram build failed partially"

echo "Building adapter-sqlite package..."
pnpm --filter @elizaos/adapter-sqlite run build || echo "⚠️ adapter-sqlite build failed partially"

echo "Building plugin-bootstrap package..."
pnpm --filter @elizaos/plugin-bootstrap run build || echo "⚠️ plugin-bootstrap build failed partially"

echo "Building agent package..."
pnpm --filter @elizaos/agent run build || echo "⚠️ agent build failed partially"

echo "Building telegram-multiagent package..."
pnpm --filter @elizaos/telegram-multiagent run build || echo "⚠️ telegram-multiagent build failed partially"

echo "✅ Build completed with permissive settings"
