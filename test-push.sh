#!/bin/bash

# Test Push Script for One-Host
# This script tries different methods to push to GitHub

set -e

echo "🔍 Testing GitHub push methods..."

# Method 1: Try with token in URL
echo "📤 Method 1: Push with token in URL"
TOKEN=$(grep "GITHUB_TOKEN=" .git-token | cut -d'=' -f2)
git remote set-url dev "https://${TOKEN}@github.com/yadavshashankr/one-host-develop.git"
git push dev main || echo "❌ Method 1 failed"

# Method 2: Try with credential helper
echo "📤 Method 2: Push with credential helper"
git remote set-url dev "https://github.com/yadavshashankr/one-host-develop.git"
echo "https://yadavshashankr:${TOKEN}@github.com" > ~/.git-credentials
git config --global credential.helper store
git push dev main || echo "❌ Method 2 failed"

# Method 3: Try with environment variable
echo "📤 Method 3: Push with environment variable"
export GITHUB_TOKEN="${TOKEN}"
git push dev main || echo "❌ Method 3 failed"

echo "✅ Push test completed" 