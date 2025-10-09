import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
// import KeyboardAwareScrollView intentionally omitted; using KeyboardAvoidingView instead

import type { Product, UnitOfMeasure } from '@/domain';

export type ProductPickerModalProps = {
  visible: boolean;
  products: Product[];
  excludedProductIds?: string[];
  multiSelect?: boolean;
  title?: string;
  subtitle?: string;
  initialQuery?: string;
  onConfirm: (selected: Product[]) => void;
  onClose: () => void;
};

function unitBadge(unit?: UnitOfMeasure) {
  switch (unit) {
    case 'GRAMS':
      return 'g';
    case 'KILOGRAMS':
      return 'kg';
    case 'MILLILITERS':
      return 'ml';
    case 'LITERS':
      return 'L';
    case 'UNITS':
    default:
      return 'un';
  }
}

export function ProductPickerModal({
  visible,
  products,
  excludedProductIds = [],
  multiSelect = true,
  title = 'Selecionar produtos',
  subtitle = 'Pesquise pelo nome, código de barras ou tag',
  initialQuery = '',
  onConfirm,
  onClose,
}: ProductPickerModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const excluded = useMemo(() => new Set(excludedProductIds), [excludedProductIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = products.filter(p => !excluded.has(p.id) && p.isActive !== false);
    if (!q) return base;
    return base.filter(p => {
      const inName = p.name?.toLowerCase().includes(q);
      const inBarcode = p.barcode?.toLowerCase().includes(q);
      const inTags = (p.tags || []).some(t => t.toLowerCase().includes(q));
      return inName || inBarcode || inTags;
    });
  }, [excluded, products, query]);

  const toggleSelect = useCallback(
    (id: string) => {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else {
          if (!multiSelect) next.clear();
          next.add(id);
        }
        return next;
      });
    },
    [multiSelect],
  );

  const handleConfirm = useCallback(() => {
    const map = new Map(products.map(p => [p.id, p] as const));
    const selected = Array.from(selectedIds)
      .map(id => map.get(id))
      .filter((p): p is Product => Boolean(p));
    onConfirm(selected);
    setSelectedIds(new Set());
  }, [onConfirm, products, selectedIds]);

  const closeAndReset = useCallback(() => {
    setSelectedIds(new Set());
    setQuery(initialQuery);
    onClose();
  }, [initialQuery, onClose]);

  const renderItem = useCallback(
    ({ item }: { item: Product }) => {
      const isSelected = selectedIds.has(item.id);
      const unit = unitBadge(item.unitOfMeasure);
      return (
        <Pressable
          onPress={() => toggleSelect(item.id)}
          style={({ pressed }) => [
            styles.row,
            pressed && styles.rowPressed,
            isSelected && styles.rowSelected,
          ]}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {item.barcode ? `EAN ${item.barcode}` : 'Sem código'} · {unit}
            </Text>
          </View>
          <View style={[styles.check, isSelected && styles.checkSelected]}>
            {isSelected ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
          </View>
        </Pressable>
      );
    },
    [selectedIds, toggleSelect],
  );

  const ListEmpty = useCallback(
    () => (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Nenhum produto encontrado.</Text>
      </View>
    ),
    [],
  );

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={closeAndReset}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable
            onPress={closeAndReset}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
          >
            <Ionicons name="close" size={22} color="#111827" />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.searchRowWrapper}
        >
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="#6B7280" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar produtos..."
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
              showSoftInputOnFocus={Platform.OS === 'android' ? true : undefined}
            />
          </View>
        </KeyboardAvoidingView>

        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={renderItem}
          ListEmptyComponent={ListEmpty}
        />

        <View style={styles.footer}>
          <Pressable
            onPress={closeAndReset}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.secondaryText}>Cancelar</Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            disabled={selectedIds.size === 0}
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || selectedIds.size === 0) && styles.primaryBtnDisabled,
            ]}
          >
            <Text style={styles.primaryText}>
              {multiSelect ? 'Adicionar selecionados' : 'Adicionar'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: 18,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  searchRowWrapper: {
    marginTop: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 6,
  },
  listContent: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  rowPressed: {
    backgroundColor: '#F9FAFB',
  },
  rowSelected: {
    backgroundColor: '#EEF2FF',
  },
  rowContent: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  rowMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    backgroundColor: '#2563EB',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  secondaryText: {
    color: '#111827',
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#111827',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  btnPressed: {
    opacity: 0.85,
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  empty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
});

export default ProductPickerModal;
