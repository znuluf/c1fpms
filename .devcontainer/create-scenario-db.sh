#!/usr/bin/env bash
# Create (or explicitly reset) an isolated, comprehensive FPMS scenario database.
# This never drops FPMS or FPMS_Simple. Requires the SQL Server container and local.env
# created by .devcontainer/start-fpms.sh.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DB_NAME="FPMS_Scenarios"
LOCAL_ENV="$ROOT/.devcontainer/local.env"
if [ ! -f "$LOCAL_ENV" ]; then
  echo "Missing $LOCAL_ENV. Run bash .devcontainer/start-fpms.sh once to initialize SQL Server and local secrets."
  exit 1
fi
set -a
. "$LOCAL_ENV"
set +a

if [ "${1:-}" = "--reset" ]; then
  if [ "${CONFIRM_RESET:-}" != "$DB_NAME" ]; then
    echo "Reset is destructive. To reset only $DB_NAME, run:"
    echo "  CONFIRM_RESET=$DB_NAME bash .devcontainer/create-scenario-db.sh --reset"
    exit 1
  fi
elif [ -n "${1:-}" ]; then
  echo "Usage: bash .devcontainer/create-scenario-db.sh [--reset]"
  exit 2
fi

docker info >/dev/null 2>&1 || { echo "Docker is not running."; exit 1; }
(cd "$ROOT/aspnet-core/docker/sqlserver" && docker compose up -d)

sqlcmd_q() {
  (cd "$ROOT/aspnet-core/docker/sqlserver" && docker compose exec -T sqlserver \
    /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$SA_PASSWORD" -b -Q "$1")
}
ready=0
for _ in $(seq 1 60); do
  if sqlcmd_q "SELECT 1" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ "$ready" = 1 ] || { echo "SQL Server did not become ready."; exit 1; }

if [ "${1:-}" = "--reset" ]; then
  echo "Dropping only $DB_NAME as explicitly requested."
  sqlcmd_q "IF DB_ID('$DB_NAME') IS NOT NULL BEGIN ALTER DATABASE [$DB_NAME] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$DB_NAME]; END"
fi

# Generate the workspace-local Initial migration if this is a fresh Codespace.
# Unlike start-fpms.sh, this script never drops the regular development databases.
MIGRATIONS="$ROOT/aspnet-core/src/Capstone.EntityFrameworkCore/Migrations"
if [ ! -d "$MIGRATIONS" ]; then
  (cd "$ROOT" && dotnet tool restore >/dev/null)
  (cd "$ROOT/aspnet-core" && dotnet ef migrations add Initial \
    --project src/Capstone.EntityFrameworkCore --startup-project src/Capstone.Web.Host)
fi

export ConnectionStrings__Default="Server=localhost,1433;Database=$DB_NAME;User Id=sa;Password=$SA_PASSWORD;TrustServerCertificate=True"
export SystemAdmin__InitialPassword="$ADMIN_PASSWORD"
export Seed__SimpleSampleData=false
export DOTNET_ENVIRONMENT=Development

echo "Migrating and seeding isolated database $DB_NAME..."
(cd "$ROOT/aspnet-core/src/Capstone.Migrator" && dotnet run -- -q --sample)

sqlcmd_q "ALTER DATABASE [$DB_NAME] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE" >/dev/null

echo
echo "Database: $DB_NAME"
echo "Sample farm: rkabubba-aqua"
echo "Farm users (password: Fpms@2026):"
echo "  arkabubba  - Farm Owner"
echo "  samsedel   - Farm Owner"
echo "  konacsus   - Farm Technician"
echo "  filusyam   - Farm Technician"
echo "System Administrator: admin / value of ADMIN_PASSWORD in .devcontainer/local.env"
echo
echo "This is test data only. It is separate from FPMS and FPMS_Simple."
