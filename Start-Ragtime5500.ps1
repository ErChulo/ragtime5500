param(
  [int]$Port = 8765,
  [string]$HtmlPath = "",
  [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

function Resolve-RagtimeHtml {
  param([string]$Requested)
  if ($Requested) {
    $resolved = Resolve-Path -LiteralPath $Requested -ErrorAction Stop
    return Get-Item -LiteralPath $resolved
  }

  $base = Split-Path -Parent $MyInvocation.ScriptName
  $latest = Join-Path $base "ragtime5500-latest.html"
  if (Test-Path -LiteralPath $latest) {
    return Get-Item -LiteralPath $latest
  }

  $candidate = Get-ChildItem -LiteralPath $base -Filter "ragtime5500-v*.html" -File |
    Sort-Object Name -Descending |
    Select-Object -First 1
  if ($candidate) { return $candidate }

  throw "Ragtime HTML was not found next to this launcher."
}

$html = Resolve-RagtimeHtml -Requested $HtmlPath
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

try {
  $listener.Start()
} catch {
  throw "Unable to start Ragtime on 127.0.0.1:$Port. $($_.Exception.Message)"
}

if ($SelfTest) {
  try {
    if (-not $listener.LocalEndpoint) { throw "Loopback listener did not start." }
    $bytes = [System.IO.File]::ReadAllBytes($html.FullName)
    if ($bytes.Length -lt 1024) { throw "Ragtime HTML looks unexpectedly small." }
    Write-Output "OFFICE LAUNCHER SELF-TEST: PASS"
    Write-Output ("HTML: " + $html.FullName)
    Write-Output ("Bytes: " + $bytes.Length)
    exit 0
  } finally {
    $listener.Stop()
  }
}

$url = "http://127.0.0.1:$Port/#/workspace"
Write-Host ""
Write-Host "Ragtime 5500 is running locally and offline." -ForegroundColor Green
Write-Host "Browser address: $url"
Write-Host "Close this window to stop Ragtime."
Write-Host ""

Start-Process $url

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)
      $requestLine = $reader.ReadLine()

      while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line -or $line.Length -eq 0) { break }
      }

      if (-not $requestLine) { continue }

      $parts = $requestLine.Split(" ")
      $path = if ($parts.Length -ge 2) { $parts[1] } else { "/" }

      if ($path -eq "/favicon.ico") {
        $header = "HTTP/1.1 204 No Content`r`nConnection: close`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        continue
      }

      $body = [System.IO.File]::ReadAllBytes($html.FullName)
      $header =
        "HTTP/1.1 200 OK`r`n" +
        "Content-Type: text/html; charset=utf-8`r`n" +
        "Content-Length: $($body.Length)`r`n" +
        "Cache-Control: no-store`r`n" +
        "X-Content-Type-Options: nosniff`r`n" +
        "Connection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
      $stream.Flush()
    } catch {
      Write-Warning $_.Exception.Message
    } finally {
      if ($reader) { $reader.Dispose() }
      if ($stream) { $stream.Dispose() }
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
