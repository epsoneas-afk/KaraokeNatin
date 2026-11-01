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
    [string]$StableAsset = "KaraokeNatin-latest.apk",
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
# Se lee como UTF-8 con ReadAllText para conservar acentos y evitar los
# metadatos (PSPath, PSParentPath...) que Get-Content agrega al string.
$body = if ($NotesFile -and (Test-Path $NotesFile)) {
    [System.IO.File]::ReadAllText((Resolve-Path $NotesFile).Path, [System.Text.Encoding]::UTF8)
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
    }
    $json = $payload | ConvertTo-Json -Depth 5
    Write-Host "Creando release $tag ..." -ForegroundColor Cyan
    # Enviar el JSON como bytes UTF-8: PowerShell 5.1 codifica el cuerpo en
    # Latin-1 por defecto y GitHub rechaza el JSON con acentos.
    $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $release = Invoke-RestMethod "$api/releases" -Headers $headers -Method Post -Body $jsonBytes -ContentType "application/json; charset=utf-8"
}

$assetName = Split-Path $Apk -Leaf
$assets = Invoke-RestMethod "$api/releases/$($release.id)/assets" -Headers $headers -Method Get

$sizeMb = [math]::Round((Get-Item $Apk).Length / 1MB, 1)
$uploadHeaders = @{} + $headers
$uploadHeaders["Content-Type"] = "application/vnd.android.package-archive"
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Apk).Path)

function Send-Asset([string]$name) {
    foreach ($a in @($assets)) {
        if ($a.name -eq $name) {
            Write-Host "Reemplazando asset existente '$name' ..." -ForegroundColor Yellow
            Invoke-RestMethod "$api/releases/assets/$($a.id)" -Headers $headers -Method Delete | Out-Null
        }
    }
    Write-Host "Subiendo '$name' ($sizeMb MB) ..." -ForegroundColor Cyan
    $url = "https://uploads.github.com/repos/$Repo/releases/$($release.id)/assets?name=$([uri]::EscapeDataString($name))"
    return Invoke-RestMethod $url -Headers $uploadHeaders -Method Post -Body $bytes
}

$asset = Send-Asset $assetName

# Copia con nombre fijo: permite un enlace permanente a la ultima APK
# (.../releases/latest/download/KaraokeNatin-latest.apk) para el codigo de
# Downloader y para el comprobador de actualizaciones dentro de la app.
if ($StableAsset) {
    Send-Asset $StableAsset | Out-Null
}

Write-Host ""
Write-Host "RELEASE PUBLICADO" -ForegroundColor Green
Write-Host "  $($release.html_url)" -ForegroundColor Green
Write-Host "  Archivo: $($asset.name)  ($([math]::Round($asset.size / 1MB, 1)) MB)" -ForegroundColor Green
if ($StableAsset) {
    Write-Host "  Enlace fijo: https://github.com/$Repo/releases/latest/download/$StableAsset" -ForegroundColor Green
}
Write-Host ""
Write-Host "Obtainium lo detectara en el proximo chequeo." -ForegroundColor Yellow
