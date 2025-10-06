import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BarcodeScannerField } from '@/components/inputs/BarcodeScannerField';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { useProducts } from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { logError } from '@/utils/logger';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<AppStackParamList, 'ProductUpsert'>;

export default function ProductFormScreen({ navigation, route }: Props) {
  const productId = route.params?.productId ?? null;
  const { user } = useAuth();
  const authorization = useAuthorization(user);
  const { products, isLoading, create, update, archive, restore, remove } = useProducts({
    includeInactive: true,
  });

  const editingProduct = useMemo(
    () => products.find(product => product.id === productId) ?? null,
    [products, productId],
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!productId) {
      setName('');
      setDescription('');
      setCategory('');
      setBarcode('');
      setTagsText('');
      return;
    }

    if (editingProduct) {
      setName(editingProduct.name);
      setDescription(editingProduct.description ?? '');
      setCategory(editingProduct.category ?? '');
      setBarcode(editingProduct.barcode ?? '');
      setTagsText(editingProduct.tags.join(', '));
    }
  }, [editingProduct, productId]);

  const title = productId ? 'Editar produto' : 'Novo produto';
  const canManage = authorization.canManageProducts;

  useEffect(() => {
    if (!canManage) {
      setFormError('Você não tem permissão para gerenciar produtos.');
    } else {
      setFormError(null);
    }
  }, [canManage]);

  const handleSubmit = async () => {
    if (!canManage) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedBarcode = barcode.trim();

    if (!trimmedName) {
      setFormError('Informe o nome do produto.');
      return;
    }

    const tags = tagsText
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    try {
      setIsSubmitting(true);
      if (productId) {
        await update(productId, {
          name: trimmedName,
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          barcode: trimmedBarcode ? trimmedBarcode : null,
          tags,
        });
        Alert.alert('Produto atualizado', 'As informações foram salvas com sucesso.', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Products'),
          },
        ]);
      } else {
        await create({
          name: trimmedName,
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          barcode: trimmedBarcode ? trimmedBarcode : null,
          tags,
        });
        Alert.alert('Produto criado', 'Cadastro realizado com sucesso.', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Products'),
          },
        ]);
      }
    } catch (submissionError) {
      setFormError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Não foi possível salvar o produto.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!productId || !canManage) {
      return;
    }

    Alert.alert('Arquivar produto', 'Confirma arquivar este produto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Arquivar',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsArchiving(true);
            await archive(productId);
            Alert.alert('Produto arquivado', 'O produto foi movido para inativos.');
          } catch (archiveError) {
            logError(archiveError, 'products.archive');
            Alert.alert('Erro', 'Não foi possível arquivar o produto.');
          } finally {
            setIsArchiving(false);
          }
        },
      },
    ]);
  };

  const handleRestore = async () => {
    if (!productId || !canManage) {
      return;
    }

    Alert.alert('Restaurar produto', 'Deseja restaurar este produto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restaurar',
        onPress: async () => {
          try {
            setIsRestoring(true);
            await restore(productId);
            Alert.alert('Produto restaurado', 'O produto voltou a ficar ativo.');
          } catch (restoreError) {
            logError(restoreError, 'products.restore');
            Alert.alert('Erro', 'Não foi possível restaurar o produto.');
          } finally {
            setIsRestoring(false);
          }
        },
      },
    ]);
  };

  const handleDelete = async () => {
    if (!productId || !canManage) {
      return;
    }

    Alert.alert(
      'Excluir produto',
      'Esta ação não pode ser desfeita. Deseja remover o produto permanentemente?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              if (!user?.id) {
                Alert.alert('Sessão expirada', 'Faça login novamente e tente de novo.');
                return;
              }

              await remove(productId, {
                performedBy: user.id,
                reason:
                  'Estoque limpo automaticamente após exclusão permanente do produto.',
              });
              Alert.alert('Produto excluído', 'O produto foi removido.', [
                {
                  text: 'OK',
                  onPress: () => navigation.navigate('Products'),
                },
              ]);
            } catch (deleteError) {
              logError(deleteError, 'products.delete');
              Alert.alert('Erro', 'Não foi possível excluir o produto.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (productId && !editingProduct && !isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Produto não encontrado</Text>
          <Text style={styles.emptyMessage}>
            O item pode ter sido removido. Retorne para a lista e selecione novamente.
          </Text>
          <Pressable
            onPress={() => navigation.navigate('Products')}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Voltar para a lista</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScreenContainer>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {productId
              ? 'Atualize as informações do produto selecionado.'
              : 'Preencha os campos abaixo para cadastrar um novo produto.'}
          </Text>

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Nome *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Sorvete de pistache"
              style={styles.input}
              editable={canManage}
              returnKeyType="next"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Descrição</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Notas de baunilha com pedaços de pistache"
              style={[styles.input, styles.multilineInput]}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={canManage}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Categoria</Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="Clássicos"
              style={styles.input}
              editable={canManage}
              returnKeyType="next"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Código de barras</Text>
            <BarcodeScannerField
              value={barcode}
              onChangeText={setBarcode}
              placeholder="Opcional"
              inputStyle={styles.input}
              editable={canManage && !isSubmitting}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Tags (separadas por vírgula)</Text>
            <TextInput
              value={tagsText}
              onChangeText={setTagsText}
              placeholder="vegano, sem lactose"
              style={styles.input}
              editable={canManage}
            />
          </View>

          <Pressable
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            disabled={!canManage || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {productId ? 'Salvar alterações' : 'Criar produto'}
              </Text>
            )}
          </Pressable>

          {productId ? (
            <View style={styles.dangerZone}>
              <Text style={styles.dangerTitle}>Ações adicionais</Text>
              <Text style={styles.dangerDescription}>
                Arquivar remove o produto das listas ativas sem perder o histórico.
                Excluir é permanente e só deve ser feito para cadastros incorretos.
              </Text>

              <View style={styles.dangerActions}>
                {editingProduct?.isActive ? (
                  <Pressable
                    onPress={handleArchive}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                    disabled={isArchiving || !canManage}
                  >
                    {isArchiving ? (
                      <ActivityIndicator color="#1F2937" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Arquivar produto</Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={handleRestore}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                    disabled={isRestoring || !canManage}
                  >
                    {isRestoring ? (
                      <ActivityIndicator color="#1F2937" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Restaurar produto</Text>
                    )}
                  </Pressable>
                )}

                {!editingProduct?.isActive ? (
                  <Pressable
                    onPress={handleDelete}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      pressed && styles.deleteButtonPressed,
                    ]}
                    disabled={isDeleting || !canManage}
                  >
                    {isDeleting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.deleteButtonText}>Excluir permanentemente</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1B1E',
  },
  subtitle: {
    fontSize: 15,
    color: '#5E5F61',
  },
  formGroup: {
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    color: '#1F2937',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  multilineInput: {
    minHeight: 120,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineHalf: {
    flex: 1,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#4E9F3D',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  deleteButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
  },
  deleteButtonPressed: {
    opacity: 0.8,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  dangerZone: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    gap: 12,
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B91C1C',
  },
  dangerDescription: {
    fontSize: 14,
    color: '#7F1D1D',
  },
  dangerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptyMessage: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
