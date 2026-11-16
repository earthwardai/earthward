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

# Optional secrets: added only once they exist in Secret Manager (see docs/operations.md).
SECRETS="APP_SECRET=earthward-app-secret:latest,ADMIN_KEY=earthward-admin-key:latest"
for pair in BLUESKY_APP_PASSWORD=earthward-bluesky-app-password MASTODON_TOKEN=earthward-mastodon-token; do
  if gcloud secrets describe "${pair#*=}" --project "$P" >/dev/null 2>&1; then SECRETS="$SECRETS,${pair}:latest"; fi
done
gcloud run deploy earthward --source . --region us-central1 --project "$P" --quiet \
  --build-service-account "projects/${P}/serviceAccounts/earthward-build@${P}.iam.gserviceaccount.com" \
  --service-account "earthward-run@${P}.iam.gserviceaccount.com" \
  --no-invoker-iam-check --max-instances 3 --min-instances 0 --concurrency 80 \
  --cpu 1 --memory 512Mi --timeout 600 \
  --env-vars-file deploy/run-env.yaml \
  --set-secrets "$SECRETS"
