import { DarkTheme, DefaultTheme, Slot, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AppDataProvider } from '@/providers/app-data-provider';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const isStandaloneRoute = ['/privacy', '/contact', '/impressum', '/practice'].includes(pathname);

  return (
    <AppDataProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {isStandaloneRoute ? (
          <Slot />
        ) : (
          <>
            <AnimatedSplashOverlay />
            <AppTabs />
          </>
        )}
      </ThemeProvider>
    </AppDataProvider>
  );
}
