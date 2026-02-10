@echo off
setlocal
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set TARGET=%STARTUP%\WatcherDaemon.cmd

if exist "%TARGET%" del "%TARGET%"
echo Startup entry removed.
