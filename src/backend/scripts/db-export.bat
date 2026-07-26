@echo off
REM Dumps the whole HisaabKitaab database (schema + data) to a gzipped .sql file
REM that db-import.bat / db-import.sh can replay into another Postgres.
REM
REM Usage:
REM   db-export.bat                      -^> hisaabkitaab-YYYYmmdd-HHMMSS.sql.gz
REM   db-export.bat backup.sql.gz
REM   set DB_URL=postgresql://user:pw@host:5432/db ^& db-export.bat
REM
REM pg_dump AND gzip both run inside the running postgres container, so Windows
REM needs no Postgres client and no gzip -- only Docker.
setlocal

if "%PG_CONTAINER%"=="" set PG_CONTAINER=hisaabkitaab-postgres
if "%DB_URL%"=="" set DB_URL=postgresql://hkadmin:admin@localhost:5432/hisaabkitaab

set OUT=%~1
if not "%OUT%"=="" goto :dump
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TS=%%i
set OUT=hisaabkitaab-%TS%.sql.gz

:dump
REM pipefail: without it a failed pg_dump still yields a valid, truncated .gz.
docker exec -i %PG_CONTAINER% bash -c "set -o pipefail; pg_dump --clean --if-exists --no-owner --no-privileges '%DB_URL%' | gzip" > "%OUT%"
if errorlevel 1 (
    echo ERROR: dump failed, %OUT% is incomplete
    del "%OUT%" 2>nul
    exit /b 1
)

echo wrote %OUT%
endlocal
