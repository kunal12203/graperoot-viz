# GrapeRoot Viz — Windows installer
# Usage: irm graperoot.dev/viz/install.ps1 | iex
#
# Downloads and silently installs the latest GrapeRoot Viz release.
# Run PowerShell as Administrator for best results.

$ErrorActionPreference = "Stop"
$REPO = "kunal12203/graperoot-viz"

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  🍇 GrapeRoot Viz Installer" -ForegroundColor Magenta
Write-Host "  https://github.com/$REPO/releases" -ForegroundColor DarkGray
Write-Host ""

# ── Fetch latest release ──────────────────────────────────────────────────────
Write-Step "Fetching latest release..."
try {
    $release = Invoke-RestMethod "https://api.github.com/repos/$REPO/releases/latest"
} catch {
    Write-Host "  ✗ Could not fetch release info. Check your internet connection." -ForegroundColor Red
    exit 1
}

$version = $release.tag_name
Write-Step "Latest version: $version"

# ── Find EXE asset ────────────────────────────────────────────────────────────
$asset = $release.assets | Where-Object { $_.name -like "*.exe" -and $_.name -notlike "*.blockmap" } | Select-Object -First 1
if (-not $asset) {
    Write-Host "  ✗ No .exe asset found in release $version" -ForegroundColor Red
    exit 1
}

$url      = $asset.browser_download_url
$filename = $asset.name
$dest     = Join-Path $env:TEMP $filename

# ── Download ──────────────────────────────────────────────────────────────────
Write-Step "Downloading $filename..."
try {
    $progressPreference = "SilentlyContinue"
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    $progressPreference = "Continue"
} catch {
    Write-Host "  ✗ Download failed: $_" -ForegroundColor Red
    exit 1
}

# ── Install ───────────────────────────────────────────────────────────────────
Write-Step "Installing (silent)..."
$proc = Start-Process -FilePath $dest -ArgumentList "/S" -Wait -PassThru

if ($proc.ExitCode -eq 0) {
    Write-OK "GrapeRoot Viz $version installed successfully!"
    Write-Host ""
    Write-Host "  Launch it from the Start Menu or Desktop shortcut." -ForegroundColor DarkGray
    Write-Host ""
} else {
    Write-Warn "Installer exited with code $($proc.ExitCode)."
    Write-Warn "Try running the installer manually: $dest"
}

# Clean up temp file
Remove-Item $dest -ErrorAction SilentlyContinue
