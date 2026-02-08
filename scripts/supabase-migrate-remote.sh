#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing env: SUPABASE_ACCESS_TOKEN"
  exit 1
fi

if [[ -z "${SUPABASE_PROJECT_ID:-}" ]]; then
  echo "Missing env: SUPABASE_PROJECT_ID"
  exit 1
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Missing env: SUPABASE_DB_PASSWORD"
  exit 1
fi

echo "Linking project ${SUPABASE_PROJECT_ID}..."
supabase link --project-ref "${SUPABASE_PROJECT_ID}"

echo "Pushing migrations (include-all)..."
supabase db push --linked --include-all --password "${SUPABASE_DB_PASSWORD}"

echo "Migration push completed."
