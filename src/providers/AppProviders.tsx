import { PropsWithChildren } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, View } from 'react-native';

import { FullScreenLoader } from '@/components/FullScreenLoader';
import { AuthProvider } from '@/contexts/AuthContext';
import { GlobalLockProvider, useGlobalLock } from '@/contexts/GlobalLockContext';
import { AppThemeProvider, useAppTheme } from '@/providers/AppThemeProvider';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <GlobalLockProvider>
          <StatusBarController />
          <InnerApp>{children}</InnerApp>
        </GlobalLockProvider>
      </AuthProvider>
    </AppThemeProvider>
  );
}

function InnerApp({ children }: PropsWithChildren) {
  const { isLocked } = useGlobalLock();
  return (
    <View style={styles.container}>
      <View style={styles.childrenWrap} pointerEvents={isLocked ? 'none' : 'auto'}>
        {children}
      </View>

      {/* Defensive overlay: intercept all touches while locked to avoid
          accidental interactions if other overlays don't capture events. */}
      {isLocked ? <Pressable style={styles.interceptOverlay} onPress={() => {}} /> : null}

      <FullScreenLoader visible={isLocked} />
    </View>
  );
}

function StatusBarController() {
  const { colorScheme } = useAppTheme();

  return <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  childrenWrap: {
    flex: 1,
  },
  interceptOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99998,
    backgroundColor: 'transparent',
  },
});
