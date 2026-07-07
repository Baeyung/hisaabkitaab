-- Runs once, only when the data volume is first created (empty).
-- The `hisaabkitaab` database and `hkadmin` role are created by the
-- POSTGRES_DB / POSTGRES_USER env vars before this script runs, so this
-- file is for anything extra the schema needs on a fresh cluster.

\connect hisaabkitaab

-- Useful extensions (uncomment as needed by the app)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";
