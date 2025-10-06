import { PropsWithChildren } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { AuthProvider } from '@/contexts/AuthContext';
import { AppThemeProvider, useAppTheme } from '@/providers/AppThemeProvider';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <StatusBarController />
        <View style={styles.container}>{children}</View>
      </AuthProvider>
    </AppThemeProvider>
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
