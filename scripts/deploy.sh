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

echo "📊 Snapshotting drop feed data..."
python3 -c "
import json, os
events = []
src = os.path.expanduser('~/.openclaw/workspace/proof-engine/data/events.jsonl')
dst = os.path.join(os.path.dirname(os.path.abspath('$0')), '..', 'src', 'data', 'drops.json')
if os.path.exists(src):
    with open(src) as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                d = json.loads(line)
                if d.get('event_type') in ('new_shipment','in_store','allocation_assigned','store_stock_increase') and d.get('rarity_tier') in ('allocated','limited','unicorn'):
                    events.append(d)
            except: pass
    events.sort(key=lambda x: x.get('timestamp',''), reverse=True)
    drops = events[:50]
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w') as f:
        json.dump({'drops': drops, 'total': len(events), 'lastUpdated': drops[0]['timestamp'] if drops else ''}, f)
    print(f'  Wrote {len(drops)} drops')
else:
    print('  Warning: events.jsonl not found, using existing drops.json')
" 2>/dev/null || echo "  Snapshot skipped"

echo "🔨 Building..."
npm run build

echo "📦 Committing..."
git add -A
git commit -m "$MSG" || echo "Nothing to commit"

echo "🚀 Pushing to GitHub..."
git push origin main

echo "🌐 Deploying to Vercel..."
npx vercel --prod --token "$TOKEN" --yes

echo "✅ Live at bourbonsignal.com"
