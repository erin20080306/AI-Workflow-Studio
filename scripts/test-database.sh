#!/usr/bin/env bash

set -euo pipefail

readonly DATABASE_IMAGE="postgres:16.13-alpine"
readonly DATABASE_NAME="workflow_test"
readonly DATABASE_USER="postgres"
readonly DATABASE_PASSWORD="local-test-only"
readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

container_id=""

cleanup() {
  if [[ "$container_id" =~ ^[a-f0-9]{64}$ ]]; then
    docker stop --time 5 "$container_id" >/dev/null
  fi
}

trap cleanup EXIT INT TERM

container_id="$(
  docker run \
    --detach \
    --rm \
    --env "POSTGRES_DB=$DATABASE_NAME" \
    --env "POSTGRES_PASSWORD=$DATABASE_PASSWORD" \
    --env "POSTGRES_USER=$DATABASE_USER" \
    "$DATABASE_IMAGE"
)"

if [[ ! "$container_id" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Database test failed: Docker returned an invalid container identifier." >&2
  exit 1
fi

database_ready="false"
for _attempt in $(seq 1 30); do
  if docker exec "$container_id" \
    psql --dbname "$DATABASE_NAME" --tuples-only --command "SELECT 1" --username "$DATABASE_USER" \
    >/dev/null 2>&1; then
    database_ready="true"
    break
  fi
  sleep 1
done

if [[ "$database_ready" != "true" ]]; then
  echo "Database test failed: PostgreSQL did not become ready within 30 seconds." >&2
  exit 1
fi

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/tests/bootstrap.sql"

shopt -s nullglob
migration_files=("$REPOSITORY_ROOT"/supabase/migrations/*.sql)
if [[ "${#migration_files[@]}" -eq 0 ]]; then
  echo "Database test failed: no migration files were found." >&2
  exit 1
fi

for migration_file in "${migration_files[@]}"; do
  docker exec --interactive "$container_id" \
    psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
    <"$migration_file"
done

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/tests/rls.sql"

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/tests/agent-jobs.sql"

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/tests/google-connections.sql"

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/tests/run-orchestration.sql"

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/tests/platform-admin-billing.sql"

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/tests/ai-conversations.sql"

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/tests/seed-user.sql"

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/seed.sql"

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/seed.sql"

docker exec --interactive "$container_id" \
  psql --dbname "$DATABASE_NAME" --set ON_ERROR_STOP=1 --username "$DATABASE_USER" \
  <"$REPOSITORY_ROOT/supabase/tests/seed-assertions.sql"

echo "Fresh migration, tenant isolation, and idempotent seed tests passed."
