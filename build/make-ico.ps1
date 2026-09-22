Add-Type -AssemblyName System.Drawing

function Get-RoundedRectPath([int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [Math]::Min($r * 2, [Math]::Min($w, $h))
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-AppBitmap([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)

  $pad = [Math]::Max(1, [int][Math]::Round($size * 0.06))
  $radius = [Math]::Max(2, [int][Math]::Round($size * 0.18))
  $stroke = [Math]::Max(1, [int][Math]::Round($size * 0.045))
  $tile = $size - (2 * $pad)
  $bgPath = Get-RoundedRectPath $pad $pad $tile $tile $radius
  $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#141821'))
  $g.FillPath($bgBrush, $bgPath)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#E8B923'), $stroke)
  $pen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
  $g.DrawPath($pen, $bgPath)

  $innerPad = [Math]::Max($pad + $stroke + 1, [int][Math]::Round($size * 0.18))
  $gap = [Math]::Max(1, [int][Math]::Round($size * 0.05))
  $grid = $size - (2 * $innerPad)
  $cell = [int][Math]::Floor(($grid - $gap) / 2)
  $cellRadius = [Math]::Max(1, [int][Math]::Round($cell * 0.18))
  $colors = @('#22C55E', '#3B82F6', '#F59E0B', '#EC4899')
  $xs = @($innerPad, ($innerPad + $cell + $gap), $innerPad, ($innerPad + $cell + $gap))
  $ys = @($innerPad, $innerPad, ($innerPad + $cell + $gap), ($innerPad + $cell + $gap))
  for ($i = 0; $i -lt 4; $i++) {
    $cellPath = Get-RoundedRectPath $xs[$i] $ys[$i] $cell $cell $cellRadius
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($colors[$i]))
    $g.FillPath($brush, $cellPath)
    $brush.Dispose()
    $cellPath.Dispose()
  }

  $pen.Dispose()
  $bgBrush.Dispose()
  $bgPath.Dispose()
  $g.Dispose()
  return $bmp
}

function Get-Dib([System.Drawing.Bitmap]$bmp) {
  $w = $bmp.Width
  $h = $bmp.Height
  $pixels = New-Object byte[] ($w * $h * 4)
  for ($y = 0; $y -lt $h; $y++) {
    $srcY = $h - 1 - $y
    for ($x = 0; $x -lt $w; $x++) {
      $c = $bmp.GetPixel($x, $srcY)
      $i = ($y * $w + $x) * 4
      $pixels[$i] = $c.B
      $pixels[$i + 1] = $c.G
      $pixels[$i + 2] = $c.R
      $pixels[$i + 3] = $c.A
    }
  }
  $rowMask = [Math]::Ceiling($w / 32.0) * 4
  $mask = New-Object byte[] ($rowMask * $h)

  $header = New-Object byte[] 40
  [BitConverter]::GetBytes([int]40).CopyTo($header, 0)
  [BitConverter]::GetBytes([int]$w).CopyTo($header, 4)
  [BitConverter]::GetBytes([int]($h * 2)).CopyTo($header, 8)
  [BitConverter]::GetBytes([int16]1).CopyTo($header, 12)
  [BitConverter]::GetBytes([int16]32).CopyTo($header, 14)
  [BitConverter]::GetBytes([int]($pixels.Length)).CopyTo($header, 20)

  $dib = New-Object byte[] ($header.Length + $pixels.Length + $mask.Length)
  [Array]::Copy($header, 0, $dib, 0, $header.Length)
  [Array]::Copy($pixels, 0, $dib, $header.Length, $pixels.Length)
  [Array]::Copy($mask, 0, $dib, $header.Length + $pixels.Length, $mask.Length)
  return $dib
}

$pngPath = Join-Path $PSScriptRoot "icon.png"
$outPath = Join-Path $PSScriptRoot "icon.ico"

$master = New-AppBitmap 1024
$master.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$imageSizes = New-Object System.Collections.Generic.List[int]
$imageData = New-Object System.Collections.Generic.List[byte[]]
foreach ($size in $sizes) {
  $bmp = New-AppBitmap $size
  $imageSizes.Add($size) | Out-Null
  $imageData.Add((Get-Dib $bmp)) | Out-Null
  $bmp.Dispose()
}
$master.Dispose()

$count = $imageSizes.Count
$dir = New-Object byte[] (6 + (16 * $count))
[BitConverter]::GetBytes([int16]1).CopyTo($dir, 2)
[BitConverter]::GetBytes([int16]$count).CopyTo($dir, 4)

$offset = $dir.Length
for ($i = 0; $i -lt $count; $i++) {
  $size = $imageSizes[$i]
  $data = $imageData[$i]
  $entry = 6 + (16 * $i)
  $dir[$entry] = if ($size -ge 256) { 0 } else { [byte]$size }
  $dir[$entry + 1] = if ($size -ge 256) { 0 } else { [byte]$size }
  $dir[$entry + 4] = 1
  $dir[$entry + 5] = 0
  $dir[$entry + 6] = 32
  $dir[$entry + 7] = 0
  [BitConverter]::GetBytes([int]$data.Length).CopyTo($dir, $entry + 8)
  [BitConverter]::GetBytes([int]$offset).CopyTo($dir, $entry + 12)
  $offset += $data.Length
}

$fs = [System.IO.File]::Create($outPath)
$fs.Write($dir, 0, $dir.Length)
foreach ($data in $imageData) {
  $fs.Write($data, 0, $data.Length)
}
$fs.Close()
Write-Host "Wrote $pngPath and $outPath ($((Get-Item $outPath).Length) bytes)"
