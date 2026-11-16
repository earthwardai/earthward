#!/bin/bash
# Builds with Cloud Build and deploys to Cloud Run. Usage: deploy/deploy.sh [version]
set -euo pipefail
cd "$(dirname "$0")/.."
# The project comes from deploy/run-env.yaml (copy deploy/run-env.example.yaml to start).
P=$(sed -n 's/^GOOGLE_CLOUD_PROJECT: *"\(.*\)"/\1/p' deploy/run-env.yaml)
VERSION=${1:-$(date -u +%Y.%m.%d.%H%M)}
sed -i '' "s/^APP_VERSION: .*/APP_VERSION: \"${VERSION}\"/" deploy/run-env.yaml
npm run build
npm test

# Boot the built server once, the way Cloud Run will, so an import that only fails in plain Node
# (ESM versus CommonJS) is caught here instead of in a failed revision.
PORT=18080 STORE=memory COUNCIL_LLM=off node dist/server/index.js >/tmp/earthward-boot.log 2>&1 &
BOOT=$!
for _ in $(seq 1 20); do curl -sf http://127.0.0.1:18080/api/health >/dev/null && break; sleep 0.5; done
if ! curl -sf http://127.0.0.1:18080/api/health >/dev/null; then kill $BOOT 2>/dev/null; cat /tmp/earthward-boot.log; echo "Built server failed to start"; exit 1; fi
kill $BOOT

# Optional secrets: added only once they exist in Secret Manager (see docs/operations.md).
SECRETS="APP_SECRET=earthward-app-secret:latest,ADMIN_KEY=earthward-admin-key:latest"
for pair in BLUESKY_APP_PASSWORD=earthward-bluesky-app-password MASTODON_TOKEN=earthward-mastodon-token VAPID_PRIVATE_KEY=earthward-vapid-private SMTP_PASS=earthward-smtp-password; do
  if gcloud secrets describe "${pair#*=}" --project "$P" >/dev/null 2>&1; then SECRETS="$SECRETS,${pair}:latest"; fi
done
gcloud run deploy earthward --source . --region us-central1 --project "$P" --quiet \
  --build-service-account "projects/${P}/serviceAccounts/earthward-build@${P}.iam.gserviceaccount.com" \
  --service-account "earthward-run@${P}.iam.gserviceaccount.com" \
  --no-invoker-iam-check --max-instances 3 --min-instances 0 --concurrency 80 \
  --cpu 1 --memory 512Mi --timeout 600 \
  --env-vars-file deploy/run-env.yaml \
  --set-secrets "$SECRETS"
