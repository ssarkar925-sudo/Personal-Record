import React, { useRef, useState } from 'react';
import {
  FileKey,
  KeyRound,
  Lock,
  Plus,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import type { DossierFoilFinish, VaultSecurityTelemetry } from './notesVaultAnalytics.ts';

export type VaultAuditFilterOption = 'all' | 'reused' | 'stale' | 'weak' | 'starred';

export interface VaultHeroWorkstationProps {
  telemetry: VaultSecurityTelemetry;
  auditFilter: VaultAuditFilterOption;
  onAuditFilterChange: (filter: VaultAuditFilterOption) => void;
  onOpenNewItem: () => void;
  onOpenEmergencyKit: () => void;
  onLockVault: () => void;
}

const FOIL_THEMES: Record<
  Exclude<DossierFoilFinish, 'auto'>,
  {
    background: string;
    border: string;
    accentText: string;
    badgeBg: string;
    badgeText: string;
    barColor: string;
  }
> = {
  obsidian: {
    background: 'linear-gradient(135deg, #111318 0%, #1E232D 52%, #0B0D11 100%)',
    border: 'rgba(229, 193, 88, 0.42)',
    accentText: '#E5C158',
    badgeBg: 'rgba(229, 193, 88, 0.16)',
    badgeText: '#F5D97E',
    barColor: '#E5C158',
  },
  gold: {
    background: 'linear-gradient(135deg, #2A2111 0%, #4A3818 50%, #1B150A 100%)',
    border: 'rgba(229, 193, 88, 0.55)',
    accentText: '#F5D97E',
    badgeBg: 'rgba(229, 193, 88, 0.22)',
    badgeText: '#FFF3C4',
    barColor: '#E5C158',
  },
  emerald: {
    background: 'linear-gradient(135deg, #062E22 0%, #0A4B37 52%, #041D15 100%)',
    border: 'rgba(52, 211, 153, 0.44)',
    accentText: '#6EE7B7',
    badgeBg: 'rgba(16, 185, 129, 0.2)',
    badgeText: '#A7F3D0',
    barColor: '#10B981',
  },
  platinum: {
    background: 'linear-gradient(135deg, #27272A 0%, #3F3F46 50%, #18181B 100%)',
    border: 'rgba(228, 228, 231, 0.42)',
    accentText: '#E4E4E7',
    badgeBg: 'rgba(255, 255, 255, 0.14)',
    badgeText: '#F4F4F5',
    barColor: '#E4E4E7',
  },
};

export const VaultHeroWorkstation: React.FC<VaultHeroWorkstationProps> = ({
  telemetry,
  auditFilter,
  onAuditFilterChange,
  onOpenNewItem,
  onOpenEmergencyKit,
  onLockVault,
}) => {
  const [foil, setFoil] = useState<DossierFoilFinish>('auto');
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 30 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const resolvedFoil: Exclude<DossierFoilFinish, 'auto'> =
    foil !== 'auto' ? foil : telemetry.healthScore >= 80 ? 'obsidian' : 'gold';

  const theme = FOIL_THEMES[resolvedFoil];

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(1, rect.width);
    const y = (e.clientY - rect.top) / Math.max(1, rect.height);
    setTilt({
      rotateX: Number(((0.5 - y) * 11).toFixed(2)),
      rotateY: Number(((x - 0.5) * 14).toFixed(2)),
      glareX: Math.round(x * 100),
      glareY: Math.round(y * 100),
    });
  };

  const handleMouseLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 30 });
  };

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, telemetry.healthScore));
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left 5 Columns: 3D-Tilt Metallic AES-256-GCM Hardware Security Card */}
      <div className="lg:col-span-5 rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 flex flex-col justify-between gap-3.5 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-[#111318] text-[#E5C158] flex items-center justify-center">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9A7418]">
                ZERO-KNOWLEDGE HARDWARE PASS
              </div>
              <h3 className="text-xs font-bold text-[#111318]">
                AES-256-GCM · PBKDF2 (600,000 Rounds)
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D6] bg-[#FAF8F5] px-2.5 py-1 text-[11px] font-semibold text-[#111318] hover:bg-[#F3EFEA] transition-colors cursor-pointer"
          >
            <RotateCw className="h-3 w-3 text-[#9A7418]" />
            <span>Flip 3D</span>
          </button>
        </div>

        {/* 3D Metallic Card Stage */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={() => setFlipped((f) => !f)}
          style={{ perspective: '1100px' }}
          className="cursor-pointer select-none"
        >
          <div
            style={{
              background: theme.background,
              borderColor: theme.border,
              transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
              transition: 'transform 160ms ease-out',
            }}
            className="relative rounded-2xl border p-4 sm:p-5 text-white shadow-[0_22px_44px_-18px_rgba(17,19,24,0.55)] overflow-hidden min-h-[188px] flex flex-col justify-between"
          >
            <div
              style={{
                background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.16), transparent 60%)`,
              }}
              className="pointer-events-none absolute inset-0"
            />

            {!flipped ? (
              <>
                <div className="relative z-10 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-9 rounded-md bg-gradient-to-br from-[#F5D97E] via-[#C59B27] to-[#8C6810] border border-white/25 shadow-inner flex items-center justify-center">
                      <KeyRound className="h-3.5 w-3.5 text-[#111318]" />
                    </div>
                    <div>
                      <div
                        style={{ color: theme.accentText }}
                        className="text-[9px] font-bold uppercase tracking-[0.16em]"
                      >
                        SOVEREIGN CRYPTOGRAPHIC VAULT
                      </div>
                      <h4 className="text-sm font-bold text-white tracking-tight">
                        Client-Memory Decrypted Session
                      </h4>
                    </div>
                  </div>
                  <span
                    style={{ background: theme.badgeBg, color: theme.badgeText }}
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-white/15"
                  >
                    {telemetry.healthStatus.toUpperCase()}
                  </span>
                </div>

                <div className="relative z-10 flex items-end justify-between gap-3 my-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-white/65">
                      Cryptographic Health Score
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-white">
                      {telemetry.healthScore}/100
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-white/65">
                      Encrypted Records
                    </div>
                    <div
                      style={{ color: theme.accentText }}
                      className="text-base font-bold tabular-nums"
                    >
                      {telemetry.totalItems} Sealed Items
                    </div>
                  </div>
                </div>

                <div className="relative z-10 space-y-1.5">
                  <div className="h-1.5 w-full rounded-full bg-white/12 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.max(8, telemetry.healthScore)}%`,
                        backgroundColor: theme.barColor,
                      }}
                      className="h-full rounded-full transition-all duration-300"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-white/75">
                    <span>Zero Plaintext Stored</span>
                    <span style={{ color: theme.accentText }} className="font-semibold">
                      Auto-Locks in 5m · 30s Clipboard Wipe
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="relative z-10 flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between border-b border-white/15 pb-2">
                  <span
                    style={{ color: theme.accentText }}
                    className="text-[10px] font-bold uppercase tracking-[0.15em]"
                  >
                    ZERO-KNOWLEDGE SECURITY AUDIT
                  </span>
                  <span className="text-[10px] text-white/70">Click to flip front</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white/8 border border-white/12 px-2.5 py-2 flex items-center justify-between">
                    <span className="text-white/80">Weak Secrets</span>
                    <span className="font-bold text-white tabular-nums">{telemetry.weakCount}</span>
                  </div>
                  <div className="rounded-xl bg-white/8 border border-white/12 px-2.5 py-2 flex items-center justify-between">
                    <span className="text-white/80">Reused Hashes</span>
                    <span className="font-bold text-white tabular-nums">{telemetry.reusedCount}</span>
                  </div>
                  <div className="rounded-xl bg-white/8 border border-white/12 px-2.5 py-2 flex items-center justify-between">
                    <span className="text-white/80">Stale (&gt;90d)</span>
                    <span className="font-bold text-white tabular-nums">{telemetry.staleCount}</span>
                  </div>
                  <div className="rounded-xl bg-white/8 border border-white/12 px-2.5 py-2 flex items-center justify-between">
                    <span className="text-white/80">Linked Accounts</span>
                    <span className="font-bold text-white tabular-nums">{telemetry.linkedAccountsCount}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-white/75 pt-1 border-t border-white/10">
                  <span>Cipher: WebCrypto AES-256-GCM</span>
                  <span>Escrow: PLVK Emergency Kit Ready</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Foil Selector + Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-[#C59B27] mr-0.5" />
            {(['auto', 'obsidian', 'gold', 'emerald', 'platinum'] as DossierFoilFinish[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFoil(f)}
                className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold capitalize transition-colors cursor-pointer ${
                  foil === f
                    ? 'bg-[#111318] text-[#E5C158]'
                    : 'bg-[#FAF8F5] text-[#6B7280] hover:text-[#111318] border border-[#E6E1D6]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenEmergencyKit}
              className="inline-flex items-center gap-1 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] px-2.5 py-1 text-[11px] font-bold text-[#111318] hover:bg-[#F3EFEA] cursor-pointer transition-colors"
            >
              <FileKey className="h-3 w-3 text-[#C59B27]" />
              <span>Recovery Kit</span>
            </button>
            <button
              type="button"
              onClick={onOpenNewItem}
              className="inline-flex items-center gap-1 rounded-xl bg-[#111318] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1E232D] cursor-pointer transition-colors"
            >
              <Plus className="h-3 w-3 text-[#E5C158]" />
              <span>New Secret</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right 7 Columns: Interactive SVG Security Health Gauge & Credential Portfolio Mix */}
      <div className="lg:col-span-7 rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9A7418]">
              CRYPTOGRAPHIC HYGIENE &amp; CREDENTIAL DISTRIBUTION
            </div>
            <h3 className="text-sm font-bold text-[#111318]">
              Zero-Knowledge Audit Posture &amp; Sealed Item Categories
            </h3>
          </div>
          <button
            type="button"
            onClick={onLockVault}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] cursor-pointer transition-colors"
          >
            <Lock className="h-3.5 w-3.5 text-[#E11D48]" />
            <span>Lock Vault Now</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6] p-3.5 sm:p-4">
          {/* Left 5 Cols: SVG Security Gauge */}
          <div className="sm:col-span-5 flex items-center gap-3.5">
            <div className="relative h-24 w-24 shrink-0 flex items-center justify-center">
              <svg className="h-24 w-24 -rotate-90" viewBox="0 0 108 108">
                <circle
                  cx="54"
                  cy="54"
                  r={radius}
                  fill="none"
                  stroke="#E6E1D6"
                  strokeWidth="9"
                />
                <circle
                  cx="54"
                  cy="54"
                  r={radius}
                  fill="none"
                  stroke={
                    telemetry.healthScore >= 80
                      ? '#059669'
                      : telemetry.healthScore >= 60
                        ? '#C59B27'
                        : '#E11D48'
                  }
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-base font-extrabold text-[#111318] tabular-nums">
                  {telemetry.healthScore}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Score
                </span>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <div className="font-bold text-[#111318]">{telemetry.healthStatus} Posture</div>
              <div className="text-[11px] text-[#059669] font-semibold tabular-nums">
                ✓ {telemetry.totalItems} Encrypted
              </div>
              <div className="text-[11px] text-[#9A7418] font-semibold tabular-nums">
                ★ {telemetry.starredCount} Starred Priority
              </div>
              <div className="text-[10px] text-[#6B7280]">
                SHA-256 Local Audit Active
              </div>
            </div>
          </div>

          {/* Right 7 Cols: Credential Type Mix */}
          <div className="sm:col-span-7 space-y-1.5 border-t sm:border-t-0 sm:border-l border-[#E6E1D6] pt-3 sm:pt-0 sm:pl-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B7280] mb-1">
              <span>Credential Type Mix</span>
              <span>{telemetry.totalItems} Total</span>
            </div>
            {telemetry.typeSlices.map((slice) => (
              <div key={slice.type} className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[#111318] flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    {slice.label}
                  </span>
                  <span className="font-bold text-[#111318] tabular-nums">
                    {slice.count} ({slice.sharePct}%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#E6E1D6]/70 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(slice.count > 0 ? 6 : 0, slice.sharePct)}%`,
                      backgroundColor: slice.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom 4 Interactive Audit Filter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs tabular-nums">
          <button
            type="button"
            onClick={() => onAuditFilterChange(auditFilter === 'reused' ? 'all' : 'reused')}
            className={`text-left rounded-xl border px-3 py-2 transition-colors cursor-pointer ${
              auditFilter === 'reused'
                ? 'border-[#111318] bg-[#111318] text-white'
                : 'border-[#E6E1D6] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318]'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-75 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-[#C59B27]" /> Reused Secrets
            </div>
            <div className="text-sm font-extrabold mt-0.5">
              {telemetry.reusedCount} Flagged
            </div>
          </button>

          <button
            type="button"
            onClick={() => onAuditFilterChange(auditFilter === 'stale' ? 'all' : 'stale')}
            className={`text-left rounded-xl border px-3 py-2 transition-colors cursor-pointer ${
              auditFilter === 'stale'
                ? 'border-[#111318] bg-[#111318] text-white'
                : 'border-[#E6E1D6] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318]'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-75 flex items-center gap-1">
              <RotateCw className="h-3 w-3 text-[#9A7418]" /> Stale (&gt;90d)
            </div>
            <div className="text-sm font-extrabold mt-0.5">
              {telemetry.staleCount} Need Rotation
            </div>
          </button>

          <button
            type="button"
            onClick={() => onAuditFilterChange(auditFilter === 'weak' ? 'all' : 'weak')}
            className={`text-left rounded-xl border px-3 py-2 transition-colors cursor-pointer ${
              auditFilter === 'weak'
                ? 'border-[#E11D48] bg-[#E11D48] text-white'
                : 'border-[#E6E1D6] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318]'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-75 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-[#E11D48]" /> Weak Entropy
            </div>
            <div className="text-sm font-extrabold mt-0.5">
              {telemetry.weakCount} Vulnerable
            </div>
          </button>

          <button
            type="button"
            onClick={() => onAuditFilterChange(auditFilter === 'starred' ? 'all' : 'starred')}
            className={`text-left rounded-xl border px-3 py-2 transition-colors cursor-pointer ${
              auditFilter === 'starred'
                ? 'border-[#C59B27] bg-[#C59B27]/20 text-[#111318]'
                : 'border-[#E6E1D6] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318]'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-75 flex items-center gap-1">
              <Star className="h-3 w-3 text-[#C59B27]" /> Starred Priority
            </div>
            <div className="text-sm font-extrabold mt-0.5">
              {telemetry.starredCount} Favorites
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
