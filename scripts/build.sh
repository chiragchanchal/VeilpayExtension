#!/bin/bash
set -e

echo "🔨 Building Veilpay Extension..."

# Clean
rm -rf dist build

# Build with Vite
npm run build

echo "✅ Build complete. Output: ./dist"
