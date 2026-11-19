interface AppLogoProps {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}

export function AppLogo({ className = 'h-9 w-9', size = 36, showWordmark = false }: AppLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${showWordmark ? 'select-none' : ''}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        width={size}
        height={size}
        className={`shrink-0 ${className}`}
        aria-label="Personal Ledger Crest"
      >
        <defs>
          <linearGradient id="logoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1B1E26" />
            <stop offset="50%" stopColor="#111318" />
            <stop offset="100%" stopColor="#08090C" />
          </linearGradient>

          <linearGradient id="logoGoldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.8" />
            <stop offset="40%" stopColor="#D97706" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#F59E0B" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#78350F" stopOpacity="0.3" />
          </linearGradient>

          <radialGradient id="logoCenterGlow" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#C59B27" stopOpacity="0.25" />
            <stop offset="60%" stopColor="#C59B27" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#C59B27" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="logoGoldFoil" x1="0%" y1="0%" x2="100%" y2="90%">
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="18%" stopColor="#FDE68A" />
            <stop offset="45%" stopColor="#E5C158" />
            <stop offset="75%" stopColor="#C59B27" />
            <stop offset="100%" stopColor="#926C15" />
          </linearGradient>

          <linearGradient id="logoEmeraldAccent" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>

          <filter id="logoCrestShadow" x="-10%" y="-10%" width="130%" height="130%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000000" floodOpacity="0.6" />
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#C59B27" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Base Rounded Squircle */}
        <rect width="512" height="512" rx="116" fill="url(#logoBgGrad)" />
        <rect width="512" height="512" rx="116" fill="url(#logoCenterGlow)" />

        {/* Outer Beveled Border */}
        <rect x="10" y="10" width="492" height="492" rx="106" fill="none" stroke="url(#logoGoldBorder)" strokeWidth="4" />
        <rect x="22" y="22" width="468" height="468" rx="94" fill="none" stroke="#FFFFFF" strokeOpacity="0.04" strokeWidth="1.5" />

        {/* Sovereign Geometric Rupee & Vault Crest */}
        <g filter="url(#logoCrestShadow)">
          {/* Top Horizontal Ledger Bar */}
          <rect x="136" y="128" width="240" height="28" rx="14" fill="url(#logoGoldFoil)" />

          {/* Second Horizontal Ledger Bar */}
          <rect x="136" y="184" width="206" height="28" rx="14" fill="url(#logoGoldFoil)" />

          {/* Vertical Stem */}
          <rect x="168" y="128" width="28" height="236" rx="14" fill="url(#logoGoldFoil)" />

          {/* Upper Semi-Circular Loop of Rupee */}
          <path
            d="M 186 184 C 286 184, 336 216, 336 264 C 336 312, 286 338, 186 338"
            fill="none"
            stroke="url(#logoGoldFoil)"
            strokeWidth="28"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dynamic Diagonal Vault Leg */}
          <path d="M 230 324 L 342 414" fill="none" stroke="url(#logoGoldFoil)" strokeWidth="30" strokeLinecap="round" />

          {/* Emerald Security Vault Rivet Accent */}
          <circle cx="182" cy="264" r="8" fill="url(#logoEmeraldAccent)" />
          <circle cx="182" cy="264" r="12" fill="none" stroke="#34D399" strokeWidth="1.5" strokeOpacity="0.6" />

          {/* Diamond Wealth Sparkle in Top Right */}
          <path d="M 372 104 Q 372 120 388 120 Q 372 120 372 136 Q 372 120 356 120 Q 372 120 372 104 Z" fill="#FFFBEB" />
          <circle cx="372" cy="120" r="3" fill="#FDE68A" />
        </g>
      </svg>

      {showWordmark && (
        <div className="flex flex-col">
          <span className="font-display font-bold text-sm tracking-tight text-[#111318] leading-tight">
            Personal Ledger
          </span>
          <span className="text-[10px] font-mono-data tracking-wider uppercase text-[#858078]">
            Sovereign Wealth
          </span>
        </div>
      )}
    </div>
  );
}
