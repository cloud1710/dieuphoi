@echo off
rem Mo dashboard PC cua dieuphoi tren trinh duyet (server dang chay ngam).
if defined PP_PYTHON (set "PY=%PP_PYTHON%") else (set "PY=python")
"%PY%" "%~dp0tools\dp.py" pc
