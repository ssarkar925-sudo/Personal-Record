import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // If already in standalone mode, do not show prompt
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    const dismissed = localStorage.getItem('pl_pwa_dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pl_pwa_dismissed', String(Date.now()));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xl text-slate-900 flex items-start gap-3.5 animate-slide-up">
      <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
        <Smartphone className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-display text-sm font-bold text-slate-950 flex items-center gap-1.5">
          Install App
          <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            Offline Ready
          </span>
        </h4>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          Add Personal Ledger to your home screen for instant offline access and app window mode.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleInstall}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Install to Device
          </button>
          <button
            onClick={handleDismiss}
            className="px-2.5 py-1.5 text-slate-500 hover:text-slate-900 text-xs font-medium transition-colors cursor-pointer"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="text-slate-400 hover:text-slate-700 p-1 -mr-1 -mt-1 rounded-lg transition-colors cursor-pointer"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
