$ErrorActionPreference = "Stop"

$destDir = Join-Path $env:LOCALAPPDATA "Roblox\Plugins"
if (-not (Test-Path $destDir)) {
  New-Item -ItemType Directory -Path $destDir | Out-Null
}

function Install-One($fileName) {
  $src = Join-Path $PSScriptRoot $fileName
  if (-not (Test-Path $src)) {
    Write-Warning "Skip (missing): $src"
    return
  }
  $dest = Join-Path $destDir $fileName
  Copy-Item -Force $src $dest
  Write-Host "Installed: $dest"
}

Install-One "VibeCoderInstaller.rbxmx"
Install-One "AIGameBuilder.rbxmx"

Write-Host ""
Write-Host "Restart Roblox Studio. If a plugin fails to load, use filenames without spaces (e.g. AIGameBuilder.rbxmx)."
Write-Host "Regenerate AIGameBuilder.rbxmx after editing AIGameBuilder.lua:  python build_rbxmx.py"

