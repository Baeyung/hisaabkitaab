@echo off
REM Seeds dummy data into HisaabKitaab via the REST API (Windows), for the
REM fixed test@test.com / test account. Delegates to load-dummy-data.ps1
REM (same folder) so JSON is handled natively.
REM
REM Usage:
REM   load-dummy-data.bat
REM   load-dummy-data.bat -BaseUrl http://localhost:8080 -Email test@test.com -Password test
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0load-dummy-data.ps1" %*
set EXITCODE=%ERRORLEVEL%
endlocal & exit /b %EXITCODE%
