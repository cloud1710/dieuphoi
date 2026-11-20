@echo off
rem Mo van phong agents tai http://127.0.0.1:8765
if defined PP_PYTHON (set "PY=%PP_PYTHON%") else (set "PY=python")
start "" http://127.0.0.1:8765
"%PY%" "%~dp0tools\dp.py" serve %*
