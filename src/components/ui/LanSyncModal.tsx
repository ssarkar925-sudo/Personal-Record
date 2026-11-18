import { useState, useEffect } from 'react';
import { Wifi, RefreshCw, X, ShieldCheck, Smartphone, Laptop, Check, AlertCircle } from 'lucide-react';
import { Card, Button, Input } from './Primitives.tsx';

interface LanSyncModalProps {
  open: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export function LanSyncModal({ open, onClose, onSyncComplete }: LanSyncModalProps) {
  const [pairingData, setPairingData] = useState<{ ips: string[]; token: string; expiresAt: number } | null>(null);
  const [targetIp, setTargetIp] = useState('');
  const [targetToken, setTargetToken] = useState('');
  const [status, setStatus] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (open) {
      void fetchPairingInfo();
    }
  }, [open]);

  const fetchPairingInfo = async () => {
    try {
      setError('');
      const res = await fetch('/api/sync/pairing-qr');
      if (res.ok) {
        const json = await res.json();
        setPairingData(json.data);
      }
    } catch {
      setError('Could not retrieve local network pairing info');
    }
  };

  const handlePullSync = async () => {
    if (!targetIp.trim()) {
      setError('Please enter the IP of the other device');
      return;
    }
    if (!targetToken.trim()) {
      setError('Please enter the one-time pairing token shown on the other device');
      return;
    }
    setIsSyncing(true);
    setStatus('Connecting to peer device...');
    setError('');

    try {
      const cleanIp = targetIp.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const remoteUrl = `http://${cleanIp}/api/sync/export?token=${encodeURIComponent(targetToken.trim())}`;
      const res = await fetch(remoteUrl, {
        headers: { 'X-Sync-Token': targetToken.trim() },
      });
      if (!res.ok) throw new Error(`Remote device returned HTTP ${res.status}`);
      const payload = await res.json();

      setStatus('Applying changes into local database...');
      const localToken = pairingData?.token || '';
      const importRes = await fetch('/api/sync/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Token': localToken,
        },
        body: JSON.stringify(payload),
      });

      if (!importRes.ok) throw new Error('Failed to import into local database');
      await importRes.json();

      setStatus('Sync complete!');
      onSyncComplete?.();
      setTimeout(() => {
        setIsSyncing(false);
      }, 1500);
    } catch (err) {
      setIsSyncing(false);
      setError((err as Error).message || 'Sync failed');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 animate-panel-in">
      <Card className="w-full max-w-lg border-slate-200 bg-white text-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
              <Wifi className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-slate-950 flex items-center gap-2">
                Local Wi-Fi Token-Paired Sync
                <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  Trusted LAN
                </span>
              </h3>
              <p className="text-xs text-slate-500">Use only on private home Wi-Fi (token-authenticated HTTP)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* This Device Info */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Laptop className="h-3.5 w-3.5 text-indigo-600" />
                This Device Address
              </span>
              <button
                onClick={fetchPairingInfo}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
            <div className="space-y-1">
              {pairingData?.ips.map((ip) => (
                <div key={ip} className="flex items-center justify-between font-mono-data text-xs text-slate-800 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                  <span>http://{ip}:{window.location.port || '3000'}</span>
                  <span className="text-[10px] text-slate-500 uppercase font-sans">LAN IPv4</span>
                </div>
              ))}
            </div>
            {pairingData?.token && (
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5">
                <span className="text-xs text-slate-600">One-Time Pairing Code:</span>
                <span className="font-mono-data font-bold tracking-wider text-sm text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                  {pairingData.token}
                </span>
              </div>
            )}
          </div>

          {/* Sync With Remote Device */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-blue-600" />
              Sync with Another Device
            </h4>
            <div className="space-y-2">
              <Input
                placeholder="Enter peer IP (e.g. 192.168.1.45:4173)"
                value={targetIp}
                onChange={(e) => setTargetIp(e.target.value)}
                className="text-xs"
              />
              <Input
                placeholder="Optional peer pairing code"
                value={targetToken}
                onChange={(e) => setTargetToken(e.target.value)}
                className="text-xs"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {status && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                <Check className="h-4 w-4 shrink-0" />
                <span>{status}</span>
              </div>
            )}

            <Button
              variant="primary"
              onClick={handlePullSync}
              disabled={isSyncing}
              className="w-full"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Synchronizing...' : 'Pull & Merge Peer Ledger'}
            </Button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>End-to-end local network communication with zero cloud server exposure.</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
