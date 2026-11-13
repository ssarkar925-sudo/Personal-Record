@echo off
cd /d "%~dp0"
node --experimental-strip-types scripts/backup-db.ts
pause
