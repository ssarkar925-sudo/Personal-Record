export interface VersionManifest {
  version: string;
  build: number;
  releaseDate: string;
  apkUrl: string;
  changelog: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  build: number;
  releaseDate: string;
  apkUrl: string;
  changelog: string;
}

export const CURRENT_APP_VERSION = '1.0.0';
export const CURRENT_BUILD_NUMBER = 100;

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const manifestUrl = `${window.location.origin}/version.json?_t=${Date.now()}`;
  try {
    const res = await fetch(manifestUrl, { cache: 'no-store' });
    if (!res.ok) {
      // Fallback to absolute production URL if relative fails
      const fallbackRes = await fetch(`https://personal-ledger-amber.vercel.app/version.json?_t=${Date.now()}`, { cache: 'no-store' });
      if (!fallbackRes.ok) throw new Error('Update manifest unreachable');
      const manifest: VersionManifest = await fallbackRes.json();
      return evaluateUpdate(manifest);
    }
    const manifest: VersionManifest = await res.json();
    return evaluateUpdate(manifest);
  } catch (err) {
    console.warn('Auto-updater: unable to check for updates', err);
    return {
      hasUpdate: false,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: CURRENT_APP_VERSION,
      build: CURRENT_BUILD_NUMBER,
      releaseDate: '',
      apkUrl: 'https://personal-ledger-amber.vercel.app/PersonalLedger-latest.apk',
      changelog: '',
    };
  }
}

function evaluateUpdate(manifest: VersionManifest): UpdateCheckResult {
  const isNewer = compareSemVer(manifest.version, CURRENT_APP_VERSION) > 0 || (manifest.build > CURRENT_BUILD_NUMBER);
  return {
    hasUpdate: isNewer,
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: manifest.version,
    build: manifest.build,
    releaseDate: manifest.releaseDate,
    apkUrl: manifest.apkUrl || 'https://personal-ledger-amber.vercel.app/PersonalLedger-latest.apk',
    changelog: manifest.changelog || 'Performance improvements and security updates.',
  };
}

export function compareSemVer(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export function triggerApkDownload(apkUrl: string): void {
  try {
    // Open in external system browser or direct download
    const link = document.createElement('a');
    link.href = apkUrl;
    link.setAttribute('download', 'PersonalLedger-latest.apk');
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    window.open(apkUrl, '_blank');
  }
}
