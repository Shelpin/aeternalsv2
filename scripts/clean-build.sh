#!/bin/bash

# Exit on error
set -e

echo "🧹 Cleaning build artifacts..."
pnpm run clean

echo "📦 Installing dependencies..."
pnpm install

echo "🏗️ Building packages in order..."

echo "1️⃣ Building core dependencies..."
pnpm run build:deps

echo "2️⃣ Building plugins..."
pnpm run build:plugins

echo "3️⃣ Building agents..."
pnpm run build:agents

echo "4️⃣ Building clients..."
pnpm run build:clients

echo "✅ Build complete!"

# Validate .d.ts files
echo "🔍 Validating type declarations..."
find packages/*/dist -name "*.d.ts" | grep -v "node_modules" | sort

# Run type check
echo "📝 Running type check..."
pnpm run check:types

echo "🎉 All done! Build successful." 