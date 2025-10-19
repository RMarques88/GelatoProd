import { PropsWithChildren } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

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
      {children}
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
  },
});
