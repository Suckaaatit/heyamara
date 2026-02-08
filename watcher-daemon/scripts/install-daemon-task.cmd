@echo off
setlocal
set TASK_NAME=WatcherDaemon
set ROOT=%~dp0..
set RUNNER=%ROOT%\scripts\daemon-runner.cmd

schtasks /create /tn "%TASK_NAME%" /tr "\"%RUNNER%\"" /sc onlogon /ru "%USERNAME%" /rl LIMITED /f
if %ERRORLEVEL% NEQ 0 (
  echo Failed to create scheduled task.
  exit /b 1
)

schtasks /run /tn "%TASK_NAME%"
echo Task "%TASK_NAME%" installed and started.
