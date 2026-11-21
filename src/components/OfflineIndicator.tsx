import { WifiOff } from 'lucide-react';
import { translations, useLanguage } from '../i18n';
import { useOnlineStatus } from '../hooks/usePWAInstall';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const { lang } = useLanguage();
  const t = translations[lang];

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-4 right-4 z-[600] flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>{t.offlineBanner}</span>
    </div>
  );
}
