#!/bin/sh
set -e

echo "Starting docker-entrypoint.sh..."

# Parse DATABASE_URL to extract connection details
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

# Extract database details from DATABASE_URL
# Format: postgresql://user:password@host:port/database
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "Database configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: PostgreSQL is not available after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "PostgreSQL is unavailable - attempt $RETRY_COUNT/$MAX_RETRIES - sleeping..."
  sleep 2
done

echo "PostgreSQL is ready!"

# Check if database exists, create if it doesn't
echo "Checking if database '$DB_NAME' exists..."
export PGPASSWORD="$DB_PASSWORD"

DB_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")

if [ -z "$DB_EXISTS" ]; then
  echo "Database '$DB_NAME' does not exist. Creating..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
  echo "Database '$DB_NAME' created successfully!"

  # Run migrations for new database
  echo "Running Prisma migrations..."
  prisma migrate deploy --schema=/app/prisma/schema.prisma
  echo "Migrations completed!"
else
  echo "Database '$DB_NAME' already exists."

  # Check for failed migrations and handle migration drift
  echo "Checking migration status..."
  FAILED_MIGRATIONS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND started_at IS NOT NULL;" 2>/dev/null || echo "")

  if [ -n "$FAILED_MIGRATIONS" ]; then
    echo "WARNING: Found failed migrations (migration drift detected)"
    echo "This typically happens when the database schema doesn't match migration history."
    echo ""
    echo "Failed migrations:"
    for migration in $FAILED_MIGRATIONS; do
      echo "  - $migration"
    done
    echo ""
    echo "Resetting database schemas to resolve migration drift..."

    # Drop and recreate public schema (preserves database, removes all tables)
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<-EOSQL
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO $DB_USER;
EOSQL

    echo "Schema reset successfully!"
  fi

  # Always run migrations for existing databases
  # prisma migrate deploy is idempotent - it only applies pending migrations
  echo "Running Prisma migrations..."
  prisma migrate deploy --schema=/app/prisma/schema.prisma
  echo "Migrations completed!"
fi

unset PGPASSWORD

echo "Database initialization complete!"
echo "Starting Next.js application..."

# Execute the main command
exec "$@"
