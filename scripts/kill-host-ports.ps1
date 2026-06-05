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
Write-Host "Done. Now run: npm run server:dev"
