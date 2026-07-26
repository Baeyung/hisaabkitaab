@echo off
REM Backs up the HisaabKitaab database into this folder (the repo root).
REM
REM Usage:
REM   backup.bat                         -^> .\hisaabkitaab-YYYYmmdd-HHMMSS.sql.gz
REM   backup.bat backup.sql.gz
REM   set DB_URL=postgresql://user:pw@host:5432/db ^& backup.bat
REM
REM Restore a dump with src\backend\scripts\db-import.bat.

REM db-export.bat writes to the current directory, so cd'ing here IS the "copy
REM the artifact to the root" step -- there is nothing to move afterwards.
cd /d "%~dp0"
call "%~dp0src\backend\scripts\db-export.bat" %*
exit /b %ERRORLEVEL%
