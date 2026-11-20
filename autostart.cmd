@echo off
rem Bam dup mot lan: dat server dieuphoi tu chay ngam khi dang nhap Windows, bat no ngay, roi in duong dan ghep dien thoai.
rem Go bo: xoa tep dieuphoi-server.vbs trong thu muc Startup (Win+R, go shell:startup).
set "S=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\dieuphoi-server.vbs"
> "%S%" echo CreateObject("WScript.Shell").Run "wscript.exe ""%~dp0start-hidden.vbs""", 0, False
rem dung server cu (neu co) de ban moi len thay
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*serve-hidden.cmd*' -or $_.CommandLine -like '*dp.py*serve*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
if exist "%~dp0out\phone-link.txt" del "%~dp0out\phone-link.txt"
wscript.exe "%~dp0start-hidden.vbs"
echo Da dat tu khoi dong: %S%
echo Dang cho server len (toi 20 giay)...
set N=0
:wait
if exist "%~dp0out\phone-link.txt" goto show
set /a N+=1
if %N% geq 10 goto none
timeout /t 2 /nobreak >nul
goto wait
:show
echo Mo duong dan nay tren dien thoai:
type "%~dp0out\phone-link.txt"
goto end
:none
echo Chua thay duong dan. Xem out\serve.log (ZeroTier da bat chua? cong 8765 co dang bi cua so khac giu khong?)
:end
pause
