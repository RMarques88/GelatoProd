import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { StockMovementType } from '@/domain';

export const movementTypeLabels: Record<StockMovementType, string> = {
  increment: 'Entrada',
  decrement: 'Saída',
  adjustment: 'Ajuste manual',
  initial: 'Estoque inicial',
};

export type AdjustStockModalState = {
  visible: boolean;
  type: StockMovementType;
  quantity: string;
  note: string;
  totalCost: string;
};

export type AdjustStockModalProps = {
  state: AdjustStockModalState;
  onChange: (nextState: AdjustStockModalState) => void;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  disabled?: boolean;
};

export function AdjustStockModal({
  state,
  onChange,
  onClose,
  onConfirm,
  isSubmitting,
  disabled = false,
}: AdjustStockModalProps) {
  const shouldCaptureCost = state.type === 'increment' || state.type === 'initial';

  return (
    <Modal
      visible={state.visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Registrar movimentação</Text>
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
            <Text style={styles.modalLabel}>Tipo de movimentação</Text>
            <View style={styles.modalToggleGroup}>
              {(['increment', 'decrement', 'adjustment'] as StockMovementType[]).map(
                option => (
                  <Pressable
                    key={option}
                    onPress={() => onChange({ ...state, type: option })}
                    style={({ pressed }) => [
                      styles.modalToggleButton,
                      state.type === option && styles.modalToggleButtonActive,
                      pressed && styles.modalToggleButtonPressed,
                    ]}
                    disabled={disabled}
                  >
                    <Text
                      style={[
                        styles.modalToggleButtonText,
                        state.type === option && styles.modalToggleButtonTextActive,
                      ]}
                    >
                      {movementTypeLabels[option]}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>

            <Text style={styles.modalLabel}>Quantidade (em gramas)</Text>
            <TextInput
              value={state.quantity}
              onChangeText={value => onChange({ ...state, quantity: value })}
              placeholder="500"
              style={styles.modalInput}
              keyboardType="numeric"
              editable={!disabled}
            />
            <Text style={styles.modalHintText}>
              As movimentações são registradas em gramas, independente da unidade padrão
              do produto.
            </Text>

            {shouldCaptureCost ? (
              <View style={styles.modalFieldGroup}>
                <Text style={styles.modalLabel}>Valor total da compra (R$)</Text>
                <TextInput
                  value={state.totalCost}
                  onChangeText={value => onChange({ ...state, totalCost: value })}
                  placeholder="150,00"
                  style={styles.modalInput}
                  keyboardType="numeric"
                  editable={!disabled}
                />
              </View>
            ) : null}

            <Text style={styles.modalLabel}>Observações</Text>
            <TextInput
              value={state.note}
              onChangeText={value => onChange({ ...state, note: value })}
              placeholder="Motivo do ajuste (opcional)"
              style={[styles.modalInput, styles.modalInputMultiline]}
              multiline
              numberOfLines={3}
              editable={!disabled}
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
              <Text style={styles.modalPrimaryButtonText}>Confirmar ajuste</Text>
            )}
          </Pressable>
        </View>
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
  modalFieldGroup: {
    gap: 8,
  },
  modalToggleGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  modalToggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalToggleButtonActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  modalToggleButtonPressed: {
    opacity: 0.85,
  },
  modalToggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalToggleButtonTextActive: {
    color: '#047857',
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
  modalHintText: {
    fontSize: 12,
    color: '#6B7280',
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
