@echo off
rem The ospec CLI as one word (E1.45): runs the scripts\ospec.js beside this
rem directory with the same arguments, from any working directory.
node "%~dp0..\scripts\ospec.js" %*
exit /b %ERRORLEVEL%
