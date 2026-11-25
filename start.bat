@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0nhat-ky.txt"
echo ==== %date% %time% ==== > "%LOG%"
set "NODE="
where node >nul 2>nul && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE if exist "%NVM_SYMLINK%\node.exe" set "NODE=%NVM_SYMLINK%\node.exe"
if not defined NODE goto nonode
echo NODE=%NODE% >> "%LOG%"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5180" ^| findstr LISTENING') do (
  echo Dung ban cu PID %%p >> "%LOG%"
  taskkill /F /PID %%p >nul 2>&1
)
echo.
echo   Dinh bien ^& Ngan sach dang chay tai http://localhost:5180
echo   App TU CAP NHAT khi co ban moi - chi can de cua so nay mo.
echo   Muon tat app: dong cua so nay.
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5180"
:run
"%NODE%" server.js >> "%LOG%" 2>&1
echo [%time%] khoi dong lai >> "%LOG%"
timeout /t 1 /nobreak >nul
goto run
:nonode
echo KHONG TIM THAY NODE >> "%LOG%"
echo.
echo   May chua co Node.js. Tai ban LTS tai https://nodejs.org roi bam lai start.
pause
