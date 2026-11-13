@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0\.."

:: Check if server is already running on port 4173
powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 4173); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 (
    echo Starting Personal Ledger background server...
    start /B node --experimental-strip-types server/index.ts > nul 2>&1

    :: Wait up to 10 seconds for server to start
    set /a attempts=0
    :wait_loop
    timeout /t 1 /nobreak > nul
    powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 4173); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
    if %errorlevel% neq 0 (
        set /a attempts+=1
        if !attempts! lss 10 goto wait_loop
    )
)

:: Locate Edge or Chrome for dedicated App window mode
set BROWSER_EXE=
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined BROWSER_EXE (
    start "" "!BROWSER_EXE!" --app=http://127.0.0.1:4173/ --user-data-dir="%~dp0..\data\desktop-profile"
) else (
    start http://127.0.0.1:4173/
)

exit /b 0
