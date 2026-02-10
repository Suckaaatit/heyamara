@echo off
setlocal
set TASK_NAME=WatcherDaemon

schtasks /end /tn "%TASK_NAME%" >nul 2>&1
schtasks /delete /tn "%TASK_NAME%" /f
echo Task "%TASK_NAME%" removed.
