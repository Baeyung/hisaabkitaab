@echo off
REM Seeds dummy data into HisaabKitaab on Windows by handing load-dummy-data.sh
REM (same folder) to WSL, falling back to Git Bash. The seed data itself lives in
REM that one script -- there is no second copy here to drift out of sync.
REM
REM Seeds six demo accounts (admin, two shop owners, two staff, one fresh
REM trial) and four stocked stores. See the .sh header for the full list.
REM
REM Usage:
REM   load-dummy-data.bat                            seeds the demo accounts
REM   load-dummy-data.bat you@example.com Secret@1   uses that owner + password
REM   set BASE_URL=http://192.168.1.5:8080 && load-dummy-data.bat
REM
REM The server needs EMAIL_ENABLED=false and ADMIN_EMAILS=t@t.com.
REM
REM Needs curl + jq inside WSL/Git Bash (WSL: sudo apt install curl jq).
setlocal

if not "%~1"=="" set EMAIL=%~1
if not "%~2"=="" set PASSWORD=%~2

REM Env vars only cross into WSL if they are named in WSLENV (/u = pass inwards).
set WSLENV=EMAIL/u:PASSWORD/u:BASE_URL/u:CONTACT_NUMBER/u:ADMIN_EMAIL/u:MANAGER_EMAIL/u:VIEWER_EMAIL/u:BASIC_EMAIL/u:TRIAL_EMAIL/u

REM Forward slashes so the path survives being parsed on the way into WSL.
set "SCRIPT=%~dp0load-dummy-data.sh"
set "SCRIPT=%SCRIPT:\=/%"

where wsl >nul 2>&1 && goto :wsl
where bash >nul 2>&1 && goto :bash
echo ERROR: neither WSL nor Git Bash found. Install one (wsl --install, or Git for Windows) and re-run. 1>&2
exit /b 1

:wsl
for /f "delims=" %%p in ('wsl wslpath -u "%SCRIPT%"') do set "UNIXPATH=%%p"
wsl bash "%UNIXPATH%"
exit /b %ERRORLEVEL%

:bash
bash "%SCRIPT%"
exit /b %ERRORLEVEL%
