'use client';
import { useEffect, useState } from 'react';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isMobile(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export default function InstallPrompt() {
  const [isIOS] = useState(() => /iPhone|iPad|iPod/i.test(navigator.userAgent));
  const [visible, setVisible] = useState(() => {
    if (!isMobile() || isStandalone()) return false;
    try {
      return localStorage.getItem('rellix:pwa-dismissed') !== '1';
    } catch {
      return true;
    }
  });
  const [prompt, setPrompt] = useState<any>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem('rellix:pwa-dismissed', '1');
    } catch {}
  };

  const onInstall = async () => {
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice.catch(() => {});
      dismiss();
      return;
    }
    // iOS / no prompt available: keep modal open with instructions only
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#1b1b1b] border border-white/10 p-6 text-center shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-512.png" alt="Rellix" className="w-16 h-16 mx-auto rounded-xl mb-4" />
        <h2 className="text-xl font-bold text-white mb-1">Install Rellix</h2>
        <p className="text-sm text-[#a3a3a3] mb-5">
          Get the full-screen app experience — no address bar, easy access from your home screen.
        </p>
        {isIOS && !prompt && (
          <ol className="text-left text-xs text-[#d4d4d4] bg-white/5 rounded-lg p-3 mb-5 space-y-1">
            <li><strong>1.</strong> Tap the Share button (&#8679;/&#x25A1;&#8599;) in Safari.</li>
            <li><strong>2.</strong> Choose &quot;Add to Home Screen&quot;.</li>
          </ol>
        )}
        <div className="flex flex-col gap-2">
          <button
            onClick={onInstall}
            className="w-full rounded-full bg-[#E50914] hover:bg-[#b8070f] text-white font-semibold py-2.5 text-sm"
          >
            {prompt ? 'Install App' : isIOS ? 'Got it' : 'Try via browser'}
          </button>
          <button onClick={dismiss} className="w-full rounded-full text-[#a3a3a3] hover:text-white text-sm py-2">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
