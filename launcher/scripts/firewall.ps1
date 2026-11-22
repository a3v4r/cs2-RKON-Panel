. (Join-Path $PSScriptRoot 'common.ps1')

# Правила брандмауэра Windows: игроки подключаются к cs2.exe, судьи и игроки открывают панель и сайт скинов (node.exe).
# Нужны права администратора. Запустить один раз после установки CS2 (и после переноса папки сервера или панели).

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Нужны права администратора - сейчас Windows спросит разрешение...'
    Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`""
    exit
}

if (Test-Path $Node) {
    Write-Step "Правило для $Node"
    netsh advfirewall firewall delete rule name="Matchdesk" | Out-Null
    netsh advfirewall firewall add rule name="Matchdesk" dir=in action=allow program="$Node" enable=yes profile=any | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'netsh не смог добавить правило для панели' }
    Write-Ok 'Панель и сайт скинов доступны из локальной сети'
} else {
    Write-Warn "Не найден $Node - правило для панели не добавлено"
}

$cs2Exe = Join-Path (Get-Cs2Dir) 'game\bin\win64\cs2.exe'
Write-Step "Правило для $cs2Exe"
if (Test-Path $cs2Exe) {
    netsh advfirewall firewall delete rule name="Matchdesk CS2 Server" | Out-Null
    netsh advfirewall firewall add rule name="Matchdesk CS2 Server" dir=in action=allow program="$cs2Exe" enable=yes profile=any | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'netsh не смог добавить правило для cs2.exe' }
    Write-Ok 'Входящие подключения к серверам CS2 разрешены'
} else {
    Write-Warn 'CS2 ещё не установлен: установите его в панели и запустите firewall.bat ещё раз.'
}
Start-Sleep -Seconds 3
