@echo off
setlocal
echo Close cApp and any cApp browser tabs before continuing.
echo This configures devnet transfers and a temporary test wallet, keeps Arena simulated, and saves a backup.
pause
node "%~dp0configure-capp.mjs" %*
if errorlevel 1 (
  echo Settings were not applied. Read the message above.
)
pause
