import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface LiveNotificationPayload {
  title: string;
  body: string;
  subText?: string;
  stopLabel?: string;
  colorHex?: string;
  progress?: number;
  maxProgress?: number;
}

interface TransitLiveNotificationPluginInterface {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  showLiveNotification(options: LiveNotificationPayload): Promise<{ shown: boolean; reason?: string }>;
  dismissLiveNotification(): Promise<void>;
  addListener(
    eventName: 'trackingStopped',
    listenerFunc: (info: { reason: string }) => void
  ): Promise<PluginListenerHandle>;
}

const TransitLiveNotification = registerPlugin<TransitLiveNotificationPluginInterface>(
  'TransitLiveNotification'
);

const DEFAULT_TITLE = 'KL Transit Live — MRT, LRT & Bus';

export const liveNotificationService = {
  isNativeSupported(): boolean {
    return Capacitor.isNativePlatform();
  },

  isWebNotificationSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  async requestPermission(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await TransitLiveNotification.requestPermission();
        return Boolean(res?.granted);
      } catch {
        return false;
      }
    }
    if (this.isWebNotificationSupported()) {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      try {
        const res = await Notification.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    }
    return false;
  },

  async showOrUpdate(payload: LiveNotificationPayload, webTitleBadge?: string): Promise<boolean> {
    if (webTitleBadge && typeof document !== 'undefined') {
      document.title = `${webTitleBadge} · KL Transit Live`;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const res = await TransitLiveNotification.showLiveNotification(payload);
        return Boolean(res?.shown);
      } catch {
        return false;
      }
    }

    // On Web / Android Chrome PWA: optionally show a silent non-spammy notification via SW if permitted
    if (this.isWebNotificationSupported() && Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.showNotification(payload.title, {
              body: payload.body,
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: 'kl-transit-live-tracker',
              silent: true,
            });
            return true;
          }
        }
      } catch {
        // Fallback silently — the in-app Live Activity Pill is always visible
      }
    }
    return true;
  },

  async dismiss(): Promise<void> {
    if (typeof document !== 'undefined') {
      document.title = DEFAULT_TITLE;
    }
    if (Capacitor.isNativePlatform()) {
      try {
        await TransitLiveNotification.dismissLiveNotification();
      } catch {
        // ignore
      }
      return;
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const notifs = await reg?.getNotifications({ tag: 'kl-transit-live-tracker' });
        notifs?.forEach((n) => n.close());
      } catch {
        // ignore
      }
    }
  },

  async onStoppedFromNotification(cb: () => void): Promise<(() => void) | null> {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const handle = await TransitLiveNotification.addListener('trackingStopped', () => {
        cb();
      });
      return () => {
        handle.remove();
      };
    } catch {
      return null;
    }
  },
};
