@echo off
REM Replays a db-export dump into a Postgres database. DESTRUCTIVE: the dump
REM drops and recreates every object it contains, so anything already in the
REM target database is replaced.
REM
REM Usage:
REM   db-import.bat backup.sql.gz
REM   set DB_URL=postgresql://user:pw@server:5432/db ^& db-import.bat backup.sql.gz
REM   set FORCE=1 ^& db-import.bat backup.sql.gz          (skip the prompt)
REM
REM The dump is copied into the postgres container and unpacked there, so
REM Windows needs no gzip and no Postgres client -- only Docker. A remote target
REM just needs to be reachable from that container (host/port, not "localhost").
setlocal

set FILE=%~1
if "%FILE%"=="" (
    echo usage: db-import.bat ^<dump.sql.gz^>
    exit /b 1
)
if not exist "%FILE%" (
    echo ERROR: no such file: %FILE%
    exit /b 1
)

if "%PG_CONTAINER%"=="" set PG_CONTAINER=hisaabkitaab-postgres
if "%DB_URL%"=="" set DB_URL=postgresql://hkadmin:admin@localhost:5432/hisaabkitaab

if "%FORCE%"=="1" goto :import
echo About to overwrite %DB_URL% with %FILE%.
set REPLY=
set /p REPLY="Type 'yes' to continue: "
if not "%REPLY%"=="yes" (
    echo aborted
    exit /b 1
)

:import
docker cp "%FILE%" %PG_CONTAINER%:/tmp/hk-import.sql.gz
if errorlevel 1 exit /b 1

REM pipefail: without it a corrupt .gz feeds psql nothing and still exits 0.
docker exec -i %PG_CONTAINER% bash -c "set -o pipefail; gunzip -c /tmp/hk-import.sql.gz | psql -v ON_ERROR_STOP=1 --quiet '%DB_URL%'"
set RC=%ERRORLEVEL%
docker exec -i %PG_CONTAINER% rm -f /tmp/hk-import.sql.gz
if not "%RC%"=="0" (
    echo ERROR: import failed
    exit /b %RC%
)

REM Sanity check: the import is only useful if rows actually landed.
docker exec -i %PG_CONTAINER% psql -At "%DB_URL%" -c "select relname || ': ' || n_live_tup from pg_stat_user_tables where n_live_tup > 0 order by relname;"
endlocal
