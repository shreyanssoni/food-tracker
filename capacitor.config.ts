import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nourishme.app',
  appName: 'Nourish',
  webDir: 'public',
  server: {
    // Load from production Next.js site to keep dynamic routes working
    url: 'https://nourish-me.vercel.app',
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
