#!/bin/bash

# Exit on error
set -e

echo "🔧 Fixing better-sqlite3 compilation..."

# Set environment variables for node-gyp
export CXXFLAGS="-std=c++17"
export npm_config_build_from_source=true

# Clean the node_modules for adapter-sqlite
echo "Cleaning adapter-sqlite node_modules..."
rm -rf packages/adapter-sqlite/node_modules

# Reinstall adapter-sqlite dependencies with forced build
echo "Reinstalling adapter-sqlite dependencies..."
cd packages/adapter-sqlite
pnpm install --force

echo "✨ better-sqlite3 installation complete!" 