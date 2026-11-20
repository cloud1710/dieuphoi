@echo off
rem Lan dau: tao project Cloudflare Pages "projectorchestra" va dang trang viec cho anh Vinh.
rem Can wrangler da dang nhap (npx wrangler login). Sau lan nay server tu dang lai khi danh sach viec doi.
cd /d "%~dp0"
if defined PP_PYTHON (set "PY=%PP_PYTHON%") else (set "PY=python")
call npx --yes wrangler pages project create projectorchestra --production-branch main
"%PY%" tools\dp.py todo publish
if exist out\todo-link.txt (echo Mo duong dan nay tren dien thoai: & type out\todo-link.txt)
pause
