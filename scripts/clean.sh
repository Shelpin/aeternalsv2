#!/bin/bash

# Exit on error
set -e

# Clean all build artifacts
echo "🧹 Cleaning build artifacts..."

# Remove dist directories
find packages -type d -name "dist" -exec rm -rf {} +

# Remove turbo artifacts
find packages -type d -name ".turbo" -exec rm -rf {} +

# Remove TypeScript build info files
find packages -type f -name "*.tsbuildinfo" -exec rm -f {} +

# Remove TypeScript cache
find packages -type d -name ".tscache" -exec rm -rf {} +

echo "✨ Clean complete!"
