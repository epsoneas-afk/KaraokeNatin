<#
  Publica una APK como GitHub Release en tu fork, para que Obtainium (u otro
  actualizador) la detecte y ofrezca la actualizacion.

  Uso:
    .\scripts\publish-release.ps1 -Version 0.3.3 -Apk F:\Proyectos\karaokenatin\KaraokeNatin-0.3.3.apk

  Token: lee la variable de entorno GITHUB_TOKEN o, si no existe, el archivo
  F:\Proyectos\karaokenatin\.github-token (solo el token, sin comillas).
#>
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Apk,
    [string]$Repo = "epsoneas-afk/KaraokeNatin",
    [string]$NotesFile = "",
    [string]$TokenFile = "F:\Proyectos\karaokenatin\.github-token",
    [switch]$Draft
)

$ErrorActionPreference = "Stop"

$token = $env:GITHUB_TOKEN
if (-not $token -and (Test-Path $TokenFile)) {
    $token = (Get-Content $TokenFile -Raw).Trim()
}
if (-not $token) {
    throw "Falta el token de GitHub. Guarda un Personal Access Token en '$TokenFile' (solo el token) o define GITHUB_TOKEN."
}

if (-not (Test-Path $Apk)) { throw "No existe la APK: $Apk" }

$tag = "v$Version"
$api = "https://api.github.com/repos/$Repo"
$headers = @{
    Authorization = "Bearer $token"
    Accept        = "application/vnd.github+json"
    "User-Agent"  = "karaokenatin-publish"
}

if (-not $NotesFile) {
    $candidate = Join-Path $PSScriptRoot "..\release-notes\$tag.md"
    if (Test-Path $candidate) { $NotesFile = $candidate }
}
$body = if ($NotesFile -and (Test-Path $NotesFile)) {
    Get-Content $NotesFile -Raw
} else {
    "KaraokeNatin $tag"
}

Write-Host "Buscando release $tag en $Repo ..." -ForegroundColor Cyan
$release = $null
try {
    $release = Invoke-RestMethod "$api/releases/tags/$tag" -Headers $headers -Method Get
    Write-Host "El release ya existe (id $($release.id)). Se reutiliza." -ForegroundColor Yellow
} catch {
    $payload = @{
        tag_name   = $tag
        name       = "KaraokeNatin $tag"
        body       = $body
        draft      = [bool]$Draft
        prerelease = $false
    } | ConvertTo-Json -Depth 5
    Write-Host "Creando release $tag ..." -ForegroundColor Cyan
    $release = Invoke-RestMethod "$api/releases" -Headers $headers -Method Post -Body $payload -ContentType "application/json"
}

$assetName = Split-Path $Apk -Leaf
$assets = Invoke-RestMethod "$api/releases/$($release.id)/assets" -Headers $headers -Method Get
foreach ($a in @($assets)) {
    if ($a.name -eq $assetName) {
        Write-Host "Reemplazando asset existente '$assetName' ..." -ForegroundColor Yellow
        Invoke-RestMethod "$api/releases/assets/$($a.id)" -Headers $headers -Method Delete | Out-Null
    }
}

$sizeMb = [math]::Round((Get-Item $Apk).Length / 1MB, 1)
Write-Host "Subiendo '$assetName' ($sizeMb MB) ..." -ForegroundColor Cyan
$uploadUrl = "https://uploads.github.com/repos/$Repo/releases/$($release.id)/assets?name=$([uri]::EscapeDataString($assetName))"
$uploadHeaders = @{} + $headers
$uploadHeaders["Content-Type"] = "application/vnd.android.package-archive"
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Apk).Path)
$asset = Invoke-RestMethod $uploadUrl -Headers $uploadHeaders -Method Post -Body $bytes

Write-Host ""
Write-Host "RELEASE PUBLICADO" -ForegroundColor Green
Write-Host "  $($release.html_url)" -ForegroundColor Green
Write-Host "  Archivo: $($asset.name)  ($([math]::Round($asset.size / 1MB, 1)) MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Obtainium lo detectara en el proximo chequeo." -ForegroundColor Yellow
