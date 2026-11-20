@echo off
rem Server dieuphoi cho dien thoai, chay ngam qua start-hidden.vbs. Nhat ky: out\serve.log
if defined PP_PYTHON (set "PY=%PP_PYTHON%") else (set "PY=python")
if not exist "%~dp0out" mkdir "%~dp0out"
:again
"%PY%" -u "%~dp0tools\dp.py" serve --host zerotier --reload >> "%~dp0out\serve.log" 2>&1
timeout /t 5 /nobreak >nul
goto again
