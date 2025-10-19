import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Modal, Platform } from 'react-native';

export const FullScreenLoader: React.FC<{ visible: boolean; message?: string }> = ({
  visible,
  message = 'Aguarde, processando...',
}) => {
  if (!visible) return null;

  // Use Modal for native platforms (ensures it sits above everything). For
  // web, Modal may not behave consistently so we render an absolute overlay.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.overlay} pointerEvents="auto">
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay} pointerEvents="auto">
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  container: {
    padding: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  message: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 15,
  },
});

export default FullScreenLoader;
