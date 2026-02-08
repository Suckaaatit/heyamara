@echo off
setlocal
set ROOT=%~dp0
node "%ROOT%watcher-daemon\scripts\cli.js" %*
endlocal
