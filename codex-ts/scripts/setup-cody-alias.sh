#!/bin/bash
# Setup script for Cody CLI alias
# Run this once to make 'cody' command available globally

set -e

echo "Setting up Cody CLI..."

# Build the CLI
echo "Building TypeScript..."
npm run build

# Link globally (creates symlink to make 'cody' available)
echo "Creating global link..."
npm link

echo ""
echo "✅ Cody CLI setup complete!"
echo ""
echo "Test with:"
echo "  cody --help"
echo ""
echo "To uninstall later, run: npm unlink -g codex-ts"
