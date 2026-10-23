@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Vertex Industrial Solutions - GitHub Sync Tool
echo ========================================================
echo.

:: Navigate to script directory
cd /d "%~dp0"
echo [OK] Project directory: %CD%

echo.
echo [1/3] Checking Git repository...
if not exist ".git" (
    git init
    git branch -M main
    echo [OK] Initialized Git repository.
)

echo.
echo [2/3] Staging files and creating commit...
git add .
git commit -m "feat: initial release of Vertex Industrial Solutions platform"

echo.
echo ========================================================
echo [3/3] Push to Remote Repository
echo ========================================================
echo Remote URL: https://github.com/salemyoussef/Vertex-Industrial-Solutions.git
echo.
git remote remove origin 2>nul
git remote add origin https://github.com/salemyoussef/Vertex-Industrial-Solutions.git
git push -u origin main --force

if !errorlevel! equ 0 (
    echo.
    echo ========================================================
    echo [SUCCESS] Your clean project is now live on GitHub!
    echo ========================================================
) else (
    echo.
    echo [ERROR] Push failed. Check your GitHub permissions or credentials.
)

echo.
pause
