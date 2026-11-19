Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\PC\.gemini\antigravity\scratch\personal-ledger\test-edge2.png"
if (!(Test-Path $srcPath)) {
    Write-Error "Source 512px icon not found!"
    exit 1
}

# 1. Update public/icon-512.png
Copy-Item $srcPath "C:\Users\PC\.gemini\antigravity\scratch\personal-ledger\public\icon-512.png" -Force
Write-Host "Updated public/icon-512.png"

# Helper function to resize with high quality bicubic
function Resize-Image {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [int]$Width,
        [int]$Height,
        [bool]$Round = $false
    )
    $srcImg = [System.Drawing.Image]::FromFile($InputPath)
    $destBmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($destBmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($Round) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $Width, $Height)
        $graphics.SetClip($path)
    }

    $graphics.DrawImage($srcImg, 0, 0, $Width, $Height)
    $graphics.Dispose()
    $srcImg.Dispose()

    $parentDir = Split-Path $OutputPath -Parent
    if (!(Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }

    $destBmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBmp.Dispose()
    Write-Host "Generated: $OutputPath ($Width x $Height)"
}

# 2. Update PWA 192 icon
Resize-Image $srcPath "C:\Users\PC\.gemini\antigravity\scratch\personal-ledger\public\icon-192.png" 192 192

# 3. Android mipmap sizes
$mipmaps = @(
    @{ folder = "mipmap-mdpi"; size = 48 },
    @{ folder = "mipmap-hdpi"; size = 72 },
    @{ folder = "mipmap-xhdpi"; size = 96 },
    @{ folder = "mipmap-xxhdpi"; size = 144 },
    @{ folder = "mipmap-xxxhdpi"; size = 192 }
)

$androidRes = "C:\Users\PC\.gemini\antigravity\scratch\personal-ledger\android\app\src\main\res"

foreach ($m in $mipmaps) {
    $folderPath = Join-Path $androidRes $m.folder
    $launcherPath = Join-Path $folderPath "ic_launcher.png"
    $roundPath = Join-Path $folderPath "ic_launcher_round.png"
    $fgPath = Join-Path $folderPath "ic_launcher_foreground.png"

    Resize-Image $srcPath $launcherPath $m.size $m.size $false
    Resize-Image $srcPath $roundPath $m.size $m.size $true
    Resize-Image $srcPath $fgPath $m.size $m.size $false
}

Write-Host "All icons generated successfully!"
