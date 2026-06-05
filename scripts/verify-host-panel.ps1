# Quick check: new host panel is served
$port = if ($env:PORT) { $env:PORT } else { 3001 }
$url = "http://127.0.0.1:$port/api/version"
Write-Host "Check: $url"
try {
  $r = Invoke-RestMethod -Uri $url -Method Get
  Write-Host "build:" $r.build
  Write-Host "pid:" $r.pid
  Write-Host "panelSnippet:" $r.panelSnippet
  Write-Host "hostHtmlPath:" $r.hostHtmlPath
  if ($r.build -match "host-panel-2026-06-0[56]") {
    Write-Host "OK - server build is new." -ForegroundColor Green
  } else {
    Write-Host "OLD server on port $port (build $($r.build))." -ForegroundColor Yellow
    Write-Host "Run: npm run host:kill"
    Write-Host "Then: npm run server:dev"
  }
  if ($r.panelSnippet -eq "lan-ui") {
    Write-Host "OK - host.html is new UI." -ForegroundColor Green
  } elseif ($r.panelSnippet -eq "old-ui") {
    Write-Host "WRONG - process serves OLD html. npm run host:kill" -ForegroundColor Red
  }
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:$port/host" -UseBasicParsing
  if ($h.Headers['X-UpDown-Build'] -match "host-panel-2026-06-0[56]") {
    Write-Host "OK - /host header build is new." -ForegroundColor Green
  }
  if ($h.Content -match "Игра в сети") {
    Write-Host "OK - /host page title is new." -ForegroundColor Green
  } else {
    Write-Host "OLD page in browser cache or wrong process. Ctrl+F5 after host:kill" -ForegroundColor Yellow
  }
} catch {
  Write-Host "Server not running. Run: npm run host:kill ; npm run server:dev" -ForegroundColor Red
  exit 1
}
