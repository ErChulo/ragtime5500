@echo off
setlocal
title Ragtime 5500 - Offline Office Launcher
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Ragtime5500.ps1"
if errorlevel 1 (
  echo.
  echo Ragtime 5500 could not start.
  echo Copy the error text above when reporting the problem.
  echo.
  pause
)
endlocal
