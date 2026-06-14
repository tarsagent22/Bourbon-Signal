#!/bin/bash
# Bourbon Signal deploy helper — verify, commit, push, and deploy in one step.
# Usage: ./scripts/deploy.sh "commit message"
# Requires VERCEL_TOKEN env var or ~/.vercel-token file.
# Normal production deploys should come from a clean GitHub main build; use this helper only when an explicit manual deploy is intended.

set -euo pipefail

cd "$(dirname "$0")/.."

MSG="${1:-chore: update Bourbon Signal}"

# Load token without printing it.
TOKEN="${VERCEL_TOKEN:-$(cat ~/.vercel-token 2>/dev/null || true)}"
if [ -z "$TOKEN" ]; then
  echo "❌ No VERCEL_TOKEN env var or ~/.vercel-token file"
  exit 1
fi

echo "🔎 Verifying Bourbon Signal workflow guardrails..."
npm run test:ops
npm --prefix engine run verify:site

echo "🔨 Building..."
npm run build

echo "📦 Committing if changes exist..."
git add -A
git commit -m "$MSG" || echo "Nothing to commit"

if [ -n "$(git status --short)" ]; then
  echo "❌ Working tree is still dirty after commit attempt. Refusing to deploy."
  git status --short
  exit 1
fi

echo "🚀 Pushing to GitHub main..."
git push origin main

echo "🌐 Deploying to Vercel production..."
DEPLOY_OUTPUT=$(npx vercel --prod --token "$TOKEN" --yes 2>&1)
DEPLOY_EXIT=$?
echo "$DEPLOY_OUTPUT"
if [ $DEPLOY_EXIT -ne 0 ]; then
  echo "❌ Vercel deploy command failed before deployment could be tracked"
  exit $DEPLOY_EXIT
fi

DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -Eo 'https://[^[:space:]]+vercel\.app' | tail -n 1)
if [ -z "$DEPLOY_URL" ]; then
  echo "❌ Could not determine deployment URL from Vercel output"
  exit 1
fi

echo "🔎 Tracking deployment status for $DEPLOY_URL"
ATTEMPTS=0
MAX_ATTEMPTS=40
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  INSPECT_OUTPUT=$(npx vercel inspect "$DEPLOY_URL" --token "$TOKEN" 2>&1 || true)
  echo "$INSPECT_OUTPUT"
  if echo "$INSPECT_OUTPUT" | grep -q 'status[[:space:]]*● Ready'; then
    echo "✅ Live at bourbonsignal.com"
    exit 0
  fi
  if echo "$INSPECT_OUTPUT" | grep -Eq 'status[[:space:]]*● Error|status[[:space:]]*● Failed'; then
    echo "❌ Vercel deployment failed"
    exit 1
  fi
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 5
done

echo "⚠️ Deployment is still not Ready after polling. Check Vercel manually: $DEPLOY_URL"
exit 1
