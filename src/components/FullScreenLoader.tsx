import React from 'react';
import { Modal, View, ActivityIndicator, StyleSheet, Text } from 'react-native';

export const FullScreenLoader: React.FC<{ visible: boolean; message?: string }> = ({
  visible,
  message = 'Aguarde, processando...',
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay} pointerEvents="box-none">
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
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
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
