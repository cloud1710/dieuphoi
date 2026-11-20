@echo off
rem Tao repo private cloud1710/dieuphoi tren GitHub va day len. Can GitHub CLI (gh) da dang nhap.
cd /d "%~dp0"
git remote get-url origin >nul 2>&1
if errorlevel 1 (gh repo create cloud1710/dieuphoi --private --source . --remote origin --push) else (git push -u origin main)
pause
