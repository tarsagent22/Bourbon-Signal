#!/bin/bash
# Proof deploy script — build, commit, push, deploy in one step
# Usage: ./scripts/deploy.sh "commit message"
# Requires VERCEL_TOKEN env var or ~/.vercel-token file

set -e

cd "$(dirname "$0")/.."

MSG="${1:-fix: updates}"

# Load token
TOKEN="${VERCEL_TOKEN:-$(cat ~/.vercel-token 2>/dev/null)}"
if [ -z "$TOKEN" ]; then
  echo "❌ No VERCEL_TOKEN env var or ~/.vercel-token file"
  exit 1
fi

echo "🔨 Building..."
npm run build

echo "📦 Committing..."
git add -A
git commit -m "$MSG" || echo "Nothing to commit"

echo "🚀 Pushing to GitHub..."
git push origin main

echo "🌐 Deploying to Vercel..."
npx vercel --prod --token "$TOKEN" --yes

echo "✅ Live at proofhunt.co"
