import { Suspense } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { ErrorBoundary } from '@/components/debug/ErrorBoundary';
import { AppNavigator } from '@/navigation';
import { AppProviders } from '@/providers';

export default function App() {
  return (
    <AppProviders>
      <ErrorBoundary>
        <Suspense fallback={<SuspenseFallback />}>
          <AppNavigator />
        </Suspense>
      </ErrorBoundary>
    </AppProviders>
  );
}

function SuspenseFallback() {
  return (
    <View style={styles.fallbackContainer}>
      <ActivityIndicator size="large" color="#4E9F3D" />
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F8',
  },
});
