interface AppLogoProps {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}

export function AppLogo({ className = 'h-9 w-9', size = 36, showWordmark = false }: AppLogoProps) {
  const imgElement = (
    <img
      src="/app-logo.png"
      alt="Sarkar Communication Crest"
      width={size}
      height={size}
      className={`shrink-0 rounded-lg object-contain bg-white ${className}`}
      loading="eager"
    />
  );

  if (!showWordmark) {
    return imgElement;
  }

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      {imgElement}
      <div className="flex flex-col">
        <span className="font-display font-bold text-sm tracking-tight text-[#111318] leading-tight">
          Sarkar Communication
        </span>
        <span className="text-[10px] font-mono-data tracking-wider uppercase text-[#858078]">
          Sovereign Ledger
        </span>
      </div>
    </div>
  );
}
