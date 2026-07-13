@echo off
REM Loads dummy data into HisaabKitaab via the REST API (Windows).
REM Delegates to load-dummy-data.ps1 (same folder) so JSON is handled natively.
REM
REM Usage:
REM   load-dummy-data.bat
REM   load-dummy-data.bat -BaseUrl http://localhost:8080 -Password password123
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0load-dummy-data.ps1" %*
set EXITCODE=%ERRORLEVEL%
endlocal & exit /b %EXITCODE%
