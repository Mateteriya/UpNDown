# Stop processes listening on host server ports (old zombie servers)
$ports = @(3001, 3002, 3003)
foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $procId = $c.OwningProcess
    if (-not $procId) { continue }
    try {
      $proc = Get-Process -Id $procId -ErrorAction Stop
      Write-Host "Port ${port}: stopping PID ${procId} ($($proc.ProcessName))"
      Stop-Process -Id $procId -Force -ErrorAction Stop
    } catch {
      Write-Host "Port ${port}: could not stop PID ${procId}"
    }
  }
}

$deadline = (Get-Date).AddSeconds(5)
$busy = $false
do {
  $busy = $false
  foreach ($port in $ports) {
    $still = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($still) { $busy = $true }
  }
  if (-not $busy) { break }
  Start-Sleep -Milliseconds 200
} while ((Get-Date) -lt $deadline)

if ($busy) {
  Write-Host "Warning: 3001-3003 still in Listen after wait. New process will retry bind."
} else {
  Write-Host "Done. Ports cleared. Start: npm run server:start  (or npm run host:app)"
}
