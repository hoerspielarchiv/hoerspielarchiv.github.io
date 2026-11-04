@echo off
title FragezeichenArchiv FileDitch Uploader
cd /d "%~dp0"

echo Starting FileDitch Uploader for FragezeichenArchiv...
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3.13 or newer and try again.
    echo.
    pause
    exit /b 1
)

:: Run script. If an argument is provided, pass it as target dir, otherwise runs default.
if "%~1"=="" (
    python upload_gui.py
) else (
    python upload_gui.py "%~1"
)

echo.
echo Upload job finished.
pause
