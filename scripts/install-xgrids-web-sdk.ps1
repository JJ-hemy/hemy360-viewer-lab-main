param(
  [Parameter(Mandatory = $true)]
  [string]$Archive
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $projectRoot 'vendor\xgrids-web-sdk'
$required = @('sdk/lcc-sdk-three.js', 'sdk/lcc-sdk-three.d.ts')

if (-not (Test-Path -LiteralPath $Archive -PathType Leaf)) {
  throw "SDK archive not found: $Archive"
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($Archive)
try {
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  foreach ($entryName in $required) {
    $entry = $zip.GetEntry($entryName)
    if (-not $entry) { throw "Missing $entryName in $Archive" }
    $target = Join-Path $destination ([System.IO.Path]::GetFileName($entryName))
    $inputStream = $entry.Open()
    try {
      $outputStream = [System.IO.File]::Create($target)
      try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
    } finally { $inputStream.Dispose() }
  }
} finally { $zip.Dispose() }

Write-Host "Installed XGRIDS Web SDK 0.6.3 into $destination"
