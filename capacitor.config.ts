import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Deep link: updown://join?code=XXXX&autojoin=1
 * После `npx cap add android` добавить intent-filter в AndroidManifest
 * (scheme=updown, host=join) — см. docs/OFFLINE-PARTY.md.
 */
const config: CapacitorConfig = {
  appId: 'games.updown.app',
  appName: 'Up&Down',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
    },
  },
};

export default config;
