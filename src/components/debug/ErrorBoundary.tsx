import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { appEnv } from '@/utils/env';

type State = { hasError: boolean; error?: unknown };

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Uncaught error', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const diag = {
      env: {
        hasApiKey: !!appEnv.firebase.apiKey,
        hasAuthDomain: !!appEnv.firebase.authDomain,
        hasProjectId: !!appEnv.firebase.projectId,
        hasStorageBucket: !!appEnv.firebase.storageBucket,
        hasMessagingSenderId: !!appEnv.firebase.messagingSenderId,
        hasAppId: !!appEnv.firebase.appId,
      },
    };

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>O app encontrou um erro e não pôde iniciar</Text>
          <Text style={styles.subtitle}>Diagnóstico rápido:</Text>
          <Text style={styles.code}>{JSON.stringify(diag, null, 2)}</Text>
          <Text style={styles.hint}>
            Verifique as variáveis EXPO_PUBLIC_* na build (EAS secrets ou env no profile) e
            tente novamente. Este painel aparece para evitar que o app apenas feche sem
            explicação.
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  content: { padding: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  subtitle: { color: '#ccc', fontSize: 14, marginTop: 8, marginBottom: 4 },
  code: {
    color: '#0f0',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 12,
  },
  hint: { color: '#ddd', marginTop: 12, lineHeight: 18 },
});
