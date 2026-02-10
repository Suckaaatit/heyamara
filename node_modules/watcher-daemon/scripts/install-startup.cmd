@echo off
setlocal
set ROOT=%~dp0..
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set TARGET=%STARTUP%\WatcherDaemon.cmd

if not exist "%STARTUP%" (
  echo Startup folder not found.
  exit /b 1
)

> "%TARGET%" (
  echo @echo off
  echo call "%ROOT%\scripts\daemon-runner.cmd"
)

echo Startup entry created at "%TARGET%"
