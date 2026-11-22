. (Join-Path $PSScriptRoot 'common.ps1')

# Запуск панели: пароли, проверка Visual C++, адреса для судей, перезапуск при падении.
# Серверы CS2 и сайт скинов панель запускает сама.

if (-not (Test-Path $Node)) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) { Fail "Не найден $Node" }
    $Node = $cmd.Source
}
if (-not (Test-Path $Server)) { Fail "Не найдена панель: $Server" }

$port = Get-Setting 'PORT' '3000'
function Get-OrCreatePassword([string]$Key, [string]$What) {
    $value = Get-Setting $Key
    if (-not $value) {
        $chars = 'abcdefghjkmnpqrstuvwxyz23456789'.ToCharArray()
        $value = -join (1..8 | ForEach-Object { $chars | Get-Random })
        Set-Setting $Key $value
        Write-Ok "Пароль $What сгенерирован и записан в matchdesk.ini"
    }
    return $value
}
$password = Get-OrCreatePassword 'PANEL_PASSWORD' 'судей'
$broadcastPassword = Get-OrCreatePassword 'BROADCAST_PASSWORD' 'трансляции'

# Metamod и CounterStrikeSharp не загрузятся без Visual C++ Redistributable (x64)
$vc = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64' -ErrorAction SilentlyContinue
if (-not ($vc -and $vc.Installed -eq 1)) {
    Write-Step 'Visual C++ Redistributable x64'
    Write-Warn 'Не установлен: без него плагины сервера CS2 не загрузятся.'
    choice /T 15 /D Y /M '    Установить сейчас? (автоматически через 15 секунд)'
    if ($LASTEXITCODE -eq 1) {
        try {
            $vcExe = Join-Path $env:TEMP 'vc_redist.x64.exe'
            Invoke-WebRequest 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $vcExe -UseBasicParsing
            Write-Host '    Устанавливаю (Windows спросит разрешение администратора)...'
            $p = Start-Process $vcExe -ArgumentList '/install', '/quiet', '/norestart' -Verb RunAs -Wait -PassThru
            if ($p.ExitCode -in 0, 1638, 3010) { Write-Ok 'Установлен' } else { Write-Warn "Установщик завершился с кодом $($p.ExitCode)" }
        } catch {
            Write-Warn "Не получилось: $($_.Exception.Message). Скачайте и установите вручную: https://aka.ms/vs/17/release/vc_redist.x64.exe"
        }
    }
}

$Host.UI.RawUI.WindowTitle = "Matchdesk - port $port"
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress

Write-Host ''
Write-Host 'Matchdesk. Открыть в браузере (телефон должен быть в той же сети, что и этот ПК):' -ForegroundColor Cyan
Write-Host "    http://localhost:$port      (на этом ПК)" -ForegroundColor Green
foreach ($ip in $ips) { Write-Host "    http://${ip}:$port" -ForegroundColor Green }
Write-Host "    Судьи:      логин judge      пароль $password" -ForegroundColor Green
Write-Host "    Трансляция: логин broadcast  пароль $broadcastPassword" -ForegroundColor Green
Write-Host ''
Write-Host 'Первый запуск: «Серверы» -> «Установить CS2», затем «Настройки -> Плагины», затем один раз firewall.bat.'
Write-Host 'Это окно не закрывай - закрытие останавливает панель (серверы CS2 продолжат работать).'
Write-Host ''

$env:NODE_ENV = 'production'
$env:PORT = $port
$env:HOSTNAME = '0.0.0.0'
$env:PANEL_PASSWORD = $password
$env:BROADCAST_PASSWORD = $broadcastPassword
$env:PANEL_DATA_DIR = $DataDir

while ($true) {
    & $Node $Server
    $code = $LASTEXITCODE
    Write-Warn "[$((Get-Date).ToString('HH:mm:ss'))] Панель остановилась (код $code)."
    choice /T 5 /D Y /M 'Перезапустить панель? (автоматически через 5 секунд)'
    if ($LASTEXITCODE -ne 1) { break }
}
