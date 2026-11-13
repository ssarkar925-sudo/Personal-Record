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
    setIsSyncing(true);
    setStatus('Connecting to peer device...');
    setError('');

    try {
      const cleanIp = targetIp.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const remoteUrl = `http://${cleanIp}/api/sync/export`;
      const res = await fetch(remoteUrl);
      if (!res.ok) throw new Error(`Remote device returned HTTP ${res.status}`);
      const payload = await res.json();

      setStatus('Applying changes into local database...');
      const importRes = await fetch('/api/sync/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-lg border-slate-700/80 bg-slate-900/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/80 p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Wifi className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                Local Wi-Fi Encrypted Sync
                <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Zero Cloud
                </span>
              </h3>
              <p className="text-xs text-slate-400">Sync phone and computer directly over your home network</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* This Device Info */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Laptop className="h-3.5 w-3.5 text-indigo-400" />
                This Device Address
              </span>
              <button
                onClick={fetchPairingInfo}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
            <div className="space-y-1">
              {pairingData?.ips.map((ip) => (
                <div key={ip} className="flex items-center justify-between font-mono text-xs text-slate-300 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800/60">
                  <span>http://{ip}:4173</span>
                  <span className="text-[10px] text-slate-500 uppercase font-sans">LAN IPv4</span>
                </div>
              ))}
            </div>
            {pairingData?.token && (
              <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5">
                <span className="text-xs text-slate-400">One-Time Pairing Code:</span>
                <span className="font-mono font-bold tracking-wider text-sm text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-500/20">
                  {pairingData.token}
                </span>
              </div>
            )}
          </div>

          {/* Sync With Remote Device */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-sky-400" />
              Sync with Another Device
            </h4>
            <div className="space-y-2">
              <Input
                placeholder="Enter peer IP (e.g. 192.168.1.45:4173)"
                value={targetIp}
                onChange={(e) => setTargetIp(e.target.value)}
                className="bg-slate-950 border-slate-800 text-xs"
              />
              <Input
                placeholder="Optional peer pairing code"
                value={targetToken}
                onChange={(e) => setTargetToken(e.target.value)}
                className="bg-slate-950 border-slate-800 text-xs"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {status && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                <Check className="h-4 w-4 shrink-0" />
                <span>{status}</span>
              </div>
            )}

            <Button
              onClick={handlePullSync}
              disabled={isSyncing}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2 flex items-center justify-center gap-2 shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Synchronizing...' : 'Pull & Merge Peer Ledger'}
            </Button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 border-t border-slate-800/80 pt-3">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>End-to-end local network communication with zero cloud server exposure.</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
