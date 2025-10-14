import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

import { BarcodeScannerField } from '@/components/inputs/BarcodeScannerField';

type SelectableProduct = {
  id: string;
  name: string;
  barcode?: string | null;
};

export type CreateStockItemModalState = {
  visible: boolean;
  productId: string | null;
  minimumQuantity: string;
  initialQuantity: string;
};

export type CreateStockItemModalProps = {
  products: SelectableProduct[];
  state: CreateStockItemModalState;
  isSubmitting: boolean;
  disabled?: boolean;
  onChange: (nextState: CreateStockItemModalState) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function CreateStockItemModal({
  products,
  state,
  isSubmitting,
  disabled = false,
  onChange,
  onClose,
  onConfirm,
}: CreateStockItemModalProps) {
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!state.visible) {
      setSearchTerm('');
    }
  }, [state.visible]);

  const filteredProducts = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase();

    if (!normalizedTerm) {
      return products;
    }

    return products.filter(product => {
      const name = product.name.toLowerCase();
      const barcode = product.barcode?.toLowerCase() ?? '';
      return name.includes(normalizedTerm) || barcode.includes(normalizedTerm);
    });
  }, [products, searchTerm]);

  return (
    <Modal
      visible={state.visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.containerContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Novo item de estoque</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}
            >
              <Text style={styles.closeButtonText}>Cancelar</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Produto</Text>
            {products.length === 0 ? (
              <Text style={styles.emptyProducts}>
                Todos os produtos já possuem item de estoque.
              </Text>
            ) : (
              <>
                <BarcodeScannerField
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  placeholder="Buscar produto..."
                  placeholderTextColor="#9CA3AF"
                  containerStyle={styles.searchInputContainer}
                  inputStyle={styles.searchInput}
                  editable={!disabled && products.length > 0}
                />
                <KeyboardAwareScrollView
                  style={styles.productList}
                  keyboardShouldPersistTaps="handled"
                  enableOnAndroid
                  extraScrollHeight={20}
                >
                  {filteredProducts.length === 0 ? (
                    <View style={styles.emptyResultsContainer}>
                      <Text style={styles.emptyResultsText}>
                        Nenhum produto encontrado.
                      </Text>
                    </View>
                  ) : (
                    filteredProducts.map(product => {
                      const isSelected = product.id === state.productId;

                      return (
                        <Pressable
                          key={product.id}
                          onPress={() => onChange({ ...state, productId: product.id })}
                          style={({ pressed }) => [
                            styles.productOption,
                            isSelected && styles.productOptionSelected,
                            pressed && styles.productOptionPressed,
                          ]}
                          disabled={disabled}
                        >
                          <Text
                            style={[
                              styles.productOptionText,
                              isSelected && styles.productOptionTextSelected,
                            ]}
                          >
                            {product.name}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </KeyboardAwareScrollView>
              </>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Quantidade mínima</Text>
            <TextInput
              value={state.minimumQuantity}
              onChangeText={value => onChange({ ...state, minimumQuantity: value })}
              style={styles.input}
              placeholder="0,5"
              keyboardType="numeric"
              editable={!disabled}
            />
            <Text style={styles.hintTextSmall}>
              Informe a quantidade mínima na mesma unidade cadastrada no produto (ex.: 5 =
              5 kg).
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Quantidade inicial</Text>
            <TextInput
              value={state.initialQuantity}
              onChangeText={value => onChange({ ...state, initialQuantity: value })}
              style={styles.input}
              placeholder="0"
              keyboardType="numeric"
              editable={!disabled}
            />
            <Text style={styles.hintTextSmall}>
              Informe a quantidade inicial na mesma unidade do produto. Valores serão
              convertidos internamente quando aplicável.
            </Text>
          </View>

          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            disabled={disabled || isSubmitting || products.length === 0}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Adicionar ao estoque</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 0,
    gap: 16,
    maxHeight: '90%',
  },
  containerContent: {
    padding: 24,
    gap: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closeButtonPressed: {
    backgroundColor: '#F3F4F6',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  productList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
  },
  productOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  productOptionSelected: {
    backgroundColor: '#ECFDF5',
  },
  productOptionPressed: {
    backgroundColor: '#F3F4F6',
  },
  productOptionText: {
    fontSize: 15,
    color: '#1F2937',
  },
  productOptionTextSelected: {
    fontWeight: '700',
    color: '#047857',
  },
  emptyProducts: {
    fontSize: 14,
    color: '#6B7280',
  },
  searchInput: {
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: 'transparent',
  },
  searchInputContainer: {
    marginBottom: 12,
  },
  emptyResultsContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyResultsText: {
    fontSize: 14,
    color: '#6B7280',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  primaryButton: {
    backgroundColor: '#047857',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: Platform.select({ ios: 12, android: 8, default: 10 }),
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  hintTextSmall: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
});
