import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

export type PriceRegisterState = {
  visible: boolean;
  price: string; // R$ per unit (per gram)
  note: string;
};

export type PriceRegisterProps = {
  state: PriceRegisterState;
  onChange: (next: PriceRegisterState) => void;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  unitLabel?: string;
};

export function PriceRegisterModal({
  state,
  onChange,
  onClose,
  onConfirm,
  isSubmitting = false,
  disabled = false,
  unitLabel,
}: PriceRegisterProps) {
  return (
    <Modal
      visible={state.visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.modalContent}
          enableOnAndroid
          extraScrollHeight={Platform.OS === 'android' ? 20 : 0}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Registrar preço manual</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.modalCloseButton,
                pressed && styles.modalCloseButtonPressed,
              ]}
            >
              <Text style={styles.modalCloseText}>Fechar</Text>
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.modalLabel}>Preço por unidade (R$)</Text>
            <TextInput
              value={state.price}
              onChangeText={value => onChange({ ...state, price: value })}
              placeholder="0,00"
              style={styles.modalInput}
              keyboardType="numeric"
              editable={!disabled}
              showSoftInputOnFocus={Platform.OS === 'android' ? true : undefined}
            />
            {unitLabel ? (
              <Text style={styles.modalHintText}>Informe o preço por {unitLabel}.</Text>
            ) : null}

            <Text style={styles.modalLabel}>Observações (opcional)</Text>
            <TextInput
              value={state.note}
              onChangeText={value => onChange({ ...state, note: value })}
              placeholder="Por que está ajustando o preço (opcional)"
              style={[styles.modalInput, styles.modalInputMultiline]}
              multiline
              numberOfLines={3}
              editable={!disabled}
              showSoftInputOnFocus={Platform.OS === 'android' ? true : undefined}
            />
          </View>

          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.modalPrimaryButton,
              pressed && styles.modalPrimaryButtonPressed,
            ]}
            disabled={disabled || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.modalPrimaryButtonText}>Registrar preço</Text>
            )}
          </Pressable>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modalCloseButtonPressed: {
    backgroundColor: '#F3F4F6',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  modalBody: {
    gap: 12,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  modalInputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  modalPrimaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4E9F3D',
  },
  modalPrimaryButtonPressed: {
    opacity: 0.9,
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default PriceRegisterModal;
