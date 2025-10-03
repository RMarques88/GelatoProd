import { Suspense } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { AppNavigator } from '@/navigation';
import { AppProviders } from '@/providers';

export default function App() {
  return (
    <AppProviders>
      <Suspense fallback={<SuspenseFallback />}>
        <AppNavigator />
      </Suspense>
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
