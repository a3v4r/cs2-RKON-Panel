$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Папка Matchdesk: node.exe, app\, data\, matchdesk.ini и эти скрипты в scripts\
$Root    = Split-Path -Parent $PSScriptRoot
$IniFile = Join-Path $Root 'matchdesk.ini'
$DataDir = Join-Path $Root 'data'
$Node    = Join-Path $Root 'node.exe'
$Server  = Join-Path $Root 'app\server.js'

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host "==> $Text" -ForegroundColor Cyan
}
function Write-Ok([string]$Text)   { Write-Host "    $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "    $Text" -ForegroundColor Yellow }
function Fail([string]$Text) {
    Write-Host ''
    Write-Host "ОШИБКА: $Text" -ForegroundColor Red
    exit 1
}

# matchdesk.ini: строки КЛЮЧ=значение, # - комментарий. Создаётся при первом запуске, обновление панели его не трогает.
if (-not (Test-Path $IniFile)) {
    $template = @(
        '# Настройки запуска Matchdesk. Формат: КЛЮЧ=значение, строки с # - комментарии.',
        '',
        '# Порт панели в браузере',
        'PORT=3000',
        '',
        '# Пароли двух общих аккаунтов: judge - судьи (полный доступ), broadcast - трансляция.',
        '# Пусто - пароль сгенерируется при запуске и запишется сюда.',
        'PANEL_PASSWORD=',
        'BROADCAST_PASSWORD='
    )
    [IO.File]::WriteAllLines($IniFile, $template, (New-Object Text.UTF8Encoding $true))
}

$Settings = @{}
foreach ($line in [IO.File]::ReadAllLines($IniFile)) {
    $t = $line.Trim()
    if ($t -eq '' -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -gt 0) { $Settings[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim() }
}

function Get-Setting([string]$Key, [string]$Default = '') {
    if ($Settings.ContainsKey($Key) -and $Settings[$Key] -ne '') { return $Settings[$Key] }
    return $Default
}

function Set-Setting([string]$Key, [string]$Value) {
    $lines = [Collections.Generic.List[string]]([IO.File]::ReadAllLines($IniFile))
    $found = $false
    for ($n = 0; $n -lt $lines.Count; $n++) {
        if ($lines[$n] -match "^\s*$([regex]::Escape($Key))\s*=") { $lines[$n] = "$Key=$Value"; $found = $true }
    }
    if (-not $found) { $lines.Add("$Key=$Value") }
    [IO.File]::WriteAllLines($IniFile, $lines, (New-Object Text.UTF8Encoding $true))
    $Settings[$Key] = $Value
}

# Папка сервера CS2: из настроек панели (data\settings.json), иначе папка по умолчанию
function Get-Cs2Dir {
    $file = Join-Path $DataDir 'settings.json'
    if (Test-Path $file) {
        try {
            $json = [IO.File]::ReadAllText($file).TrimStart([char]0xFEFF) | ConvertFrom-Json
            if ($json.cs2Dir) { return $json.cs2Dir }
        } catch { }
    }
    return 'C:\cs2server\cs2'
}
