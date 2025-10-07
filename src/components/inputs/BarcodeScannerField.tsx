import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import {
  Alert,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import type { TextStyle } from 'react-native';

export type BarcodeScannerFieldProps = Omit<TextInputProps, 'onChangeText' | 'value'> & {
  value: string;
  onChangeText: (value: string) => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export function BarcodeScannerField({
  value,
  onChangeText,
  placeholder,
  editable = true,
  containerStyle,
  inputStyle,
  keyboardType = 'default',
  ...rest
}: BarcodeScannerFieldProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [helperMessage, setHelperMessage] = useState<string | null>(null);

  const isDisabled = useMemo(() => editable === false, [editable]);

  const ensurePermission = useCallback(async () => {
    if (permission?.granted) {
      return true;
    }

    const response = await requestPermission();

    if (response?.granted) {
      setHelperMessage(null);
      return true;
    }

    setHelperMessage(
      'Precisamos da permissão de câmera para ler códigos de barras. Ative-a nas configurações do dispositivo.',
    );
    Alert.alert(
      'Permissão necessária',
      'Ative a permissão de câmera nas configurações do dispositivo para utilizar o leitor de código de barras.',
    );

    return false;
  }, [permission?.granted, requestPermission]);

  const handleOpenScanner = useCallback(async () => {
    if (isDisabled) {
      return;
    }

    const granted = await ensurePermission();

    if (!granted) {
      return;
    }

    setHasScanned(false);
    setScannerVisible(true);
  }, [ensurePermission, isDisabled]);

  const handleCloseScanner = useCallback(() => {
    setScannerVisible(false);
  }, []);

  const handleBarcodeDetected = useCallback(
    (event: BarcodeScanningResult) => {
      if (hasScanned) {
        return;
      }

      setHasScanned(true);
      onChangeText(event.data.trim());
      setScannerVisible(false);
    },
    [hasScanned, onChangeText],
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={[styles.field, isDisabled && styles.fieldDisabled]}>
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          editable={!isDisabled}
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, inputStyle]}
        />
        <Pressable
          style={({ pressed }) => [
            styles.scanButton,
            (pressed || scannerVisible) && !isDisabled ? styles.scanButtonPressed : null,
            isDisabled && styles.scanButtonDisabled,
          ]}
          onPress={handleOpenScanner}
          disabled={isDisabled}
        >
          <Ionicons name="camera" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      {helperMessage ? <Text style={styles.helperText}>{helperMessage}</Text> : null}

      <Modal
        animationType="slide"
        visible={scannerVisible}
        onRequestClose={handleCloseScanner}
        presentationStyle="fullScreen"
      >
        <View style={styles.scannerModal}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: [
                'qr',
                'ean13',
                'ean8',
                'upc_a',
                'upc_e',
                'code128',
                'code39',
                'code93',
                'itf14',
                'pdf417',
              ],
            }}
            onBarcodeScanned={hasScanned ? undefined : handleBarcodeDetected}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>Aponte para o código de barras</Text>
              <Pressable
                onPress={handleCloseScanner}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.closeButtonPressed,
                ]}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
            <View style={styles.scannerFrame}>
              <View style={styles.scannerFrameBorder} />
            </View>
            <Text style={styles.scannerHint}>
              O valor será preenchido automaticamente assim que o código for detectado.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D4D5D8',
    backgroundColor: '#FFFFFF',
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 4,
  },
  fieldDisabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 8,
    paddingRight: 8,
  },
  scanButton: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonPressed: {
    opacity: 0.85,
  },
  scanButtonDisabled: {
    opacity: 0.4,
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: '#B45309',
  },
  scannerModal: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 24,
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scannerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonPressed: {
    opacity: 0.75,
  },
  scannerFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrameBorder: {
    width: '70%',
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  scannerHint: {
    color: '#E5E7EB',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
});
