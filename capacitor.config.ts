import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'my.kltransit.live',
  appName: 'KL Transit Live',
  webDir: 'dist',
  backgroundColor: '#f8fafc',
  appendUserAgent: 'KLTransitLive/1.0 (+https://kltransit.live)',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#f8fafc',
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT',
    },
  },
};

export default config;
