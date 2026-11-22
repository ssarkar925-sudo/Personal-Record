Add-Type -AssemblyName System.Drawing

$sourcePath = 'C:\Users\PC\.gemini\antigravity\brain\8ff91fdf-f884-452f-a412-a153fe67a316\.user_uploaded\media_1795332031421_25943561.jpg'
$projectRoot = 'C:\Users\PC\.gemini\antigravity\scratch\personal-ledger'

if (-not (Test-Path $sourcePath)) {
    Write-Error "Source image not found at $sourcePath"
    exit 1
}

$srcImage = [System.Drawing.Image]::FromFile($sourcePath)

function Resize-And-Save($destPath, $targetWidth, $targetHeight, $bgWhite = $false) {
    $destDir = Split-Path -Parent $destPath
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    $destBitmap = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($bgWhite) {
        $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $graphics.FillRectangle($brush, 0, 0, $targetWidth, $targetHeight)
        $brush.Dispose()
    }

    $graphics.DrawImage($srcImage, 0, 0, $targetWidth, $targetHeight)
    $graphics.Dispose()

    if (Test-Path $destPath) {
        Remove-Item $destPath -Force
    }

    $destBitmap.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBitmap.Dispose()
    Write-Output "Generated: $destPath ($targetWidth x $targetHeight)"
}

# 1. Web & PWA Icons
Resize-And-Save "$projectRoot\public\app-logo.png" 512 512
Resize-And-Save "$projectRoot\public\icon-512.png" 512 512
Resize-And-Save "$projectRoot\public\icon-192.png" 192 192
Resize-And-Save "$projectRoot\public\apple-touch-icon.png" 180 180
Resize-And-Save "$projectRoot\public\favicon.png" 64 64

# Copy favicon.png to favicon.ico for standard browser compatibility
Copy-Item "$projectRoot\public\favicon.png" "$projectRoot\public\favicon.ico" -Force

# 2. Android Mipmap Launcher Icons
$mipmapDefs = @(
    @{ Name = 'mipmap-mdpi'; Size = 48 },
    @{ Name = 'mipmap-hdpi'; Size = 72 },
    @{ Name = 'mipmap-xhdpi'; Size = 96 },
    @{ Name = 'mipmap-xxhdpi'; Size = 144 },
    @{ Name = 'mipmap-xxxhdpi'; Size = 192 }
)

foreach ($m in $mipmapDefs) {
    $dir = "$projectRoot\android\app\src\main\res\$($m.Name)"
    Resize-And-Save "$dir\ic_launcher.png" $m.Size $m.Size
    Resize-And-Save "$dir\ic_launcher_round.png" $m.Size $m.Size
    Resize-And-Save "$dir\ic_launcher_foreground.png" $m.Size $m.Size
}

$srcImage.Dispose()
Write-Output "All icons generated successfully!"
