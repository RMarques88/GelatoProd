import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BarcodeScannerField } from '@/components/inputs/BarcodeScannerField';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { Product, Recipe, RecipeIngredient } from '@/domain';
import { useProducts, useRecipes } from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { logError } from '@/utils/logger';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type IngredientFormValue = {
  type: RecipeIngredient['type'];
  referenceId: string;
  quantity: string;
};

type Props = NativeStackScreenProps<AppStackParamList, 'RecipeUpsert'>;

type PickerState = {
  index: number;
  type: RecipeIngredient['type'];
};

const normalizeSearchValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function RecipeFormScreen({ navigation, route }: Props) {
  const recipeId = route.params?.recipeId ?? null;
  const { user } = useAuth();
  const authorization = useAuthorization(user);

  const { recipes, isLoading, create, update, archive, restore, remove } = useRecipes({
    includeInactive: true,
  });
  const { products } = useProducts({ includeInactive: true });

  const editingRecipe = useMemo(
    () => recipes.find(recipe => recipe.id === recipeId) ?? null,
    [recipes, recipeId],
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [yieldInGrams, setYieldInGrams] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [ingredients, setIngredients] = useState<IngredientFormValue[]>([
    { type: 'product', referenceId: '', quantity: '' },
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pickerState, setPickerState] = useState<PickerState | null>(null);

  const canManage = authorization.canManageProducts;
  const title = recipeId ? 'Editar receita' : 'Nova receita';

  const recipeOptions = useMemo(
    () => recipes.filter(recipe => recipe.id !== recipeId),
    [recipes, recipeId],
  );

  useEffect(() => {
    if (!recipeId) {
      setName('');
      setDescription('');
      setYieldInGrams('');
      setInstructions('');
      setIsActive(true);
      setIngredients([{ type: 'product', referenceId: '', quantity: '' }]);
      setFormError(null);
      return;
    }

    if (editingRecipe) {
      setName(editingRecipe.name);
      setDescription(editingRecipe.description ?? '');
      setYieldInGrams(editingRecipe.yieldInGrams.toString());
      setInstructions(editingRecipe.instructions ?? '');
      setIsActive(editingRecipe.isActive);
      setIngredients(
        editingRecipe.ingredients.length > 0
          ? editingRecipe.ingredients.map(ingredient => ({
              type: ingredient.type,
              referenceId: ingredient.referenceId,
              quantity: ingredient.quantityInGrams.toString(),
            }))
          : [{ type: 'product', referenceId: '', quantity: '' }],
      );
    }
  }, [editingRecipe, recipeId]);

  useEffect(() => {
    if (!canManage) {
      setFormError('Você não tem permissão para gerenciar receitas.');
    } else {
      setFormError(null);
    }
  }, [canManage]);

  const handleAddIngredient = () => {
    setIngredients(previous => [
      ...previous,
      { type: 'product', referenceId: '', quantity: '' },
    ]);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(previous =>
      previous.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const handleIngredientChange = (
    index: number,
    changes: Partial<IngredientFormValue>,
  ) => {
    setIngredients(previous =>
      previous.map((ingredient, currentIndex) =>
        currentIndex === index ? { ...ingredient, ...changes } : ingredient,
      ),
    );
  };

  const handleSubmit = async () => {
    if (!canManage) {
      return;
    }

    const trimmedName = name.trim();
    const yieldValue = Number(yieldInGrams.replace(',', '.'));

    if (!trimmedName) {
      setFormError('Informe o nome da receita.');
      return;
    }

    if (Number.isNaN(yieldValue) || yieldValue <= 0) {
      setFormError('Informe o rendimento em gramas da receita.');
      return;
    }

    if (!ingredients.length) {
      setFormError('Adicione ao menos um ingrediente.');
      return;
    }

    const parsedIngredients: RecipeIngredient[] = [];

    for (const ingredient of ingredients) {
      const quantity = Number(ingredient.quantity.replace(',', '.'));

      if (!ingredient.referenceId) {
        setFormError('Selecione todos os ingredientes.');
        return;
      }

      if (Number.isNaN(quantity) || quantity <= 0) {
        setFormError('Informe a quantidade em gramas para cada ingrediente.');
        return;
      }

      parsedIngredients.push({
        type: ingredient.type,
        referenceId: ingredient.referenceId,
        quantityInGrams: quantity,
      });
    }

    try {
      setIsSubmitting(true);
      if (recipeId) {
        await update(recipeId, {
          name: trimmedName,
          description: description.trim() || undefined,
          yieldInGrams: yieldValue,
          instructions: instructions.trim() || undefined,
          ingredients: parsedIngredients,
          isActive,
        });
        Alert.alert('Receita atualizada', 'As alterações foram salvas com sucesso.', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Recipes'),
          },
        ]);
      } else {
        await create({
          name: trimmedName,
          description: description.trim() || undefined,
          yieldInGrams: yieldValue,
          instructions: instructions.trim() || undefined,
          ingredients: parsedIngredients,
          isActive,
        });
        Alert.alert('Receita criada', 'Cadastro realizado com sucesso.', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Recipes'),
          },
        ]);
      }
    } catch (submissionError) {
      console.error('[RecipeForm] submit error', submissionError);
      setFormError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Não foi possível salvar a receita.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = () => {
    if (!recipeId || !canManage) {
      return;
    }

    Alert.alert('Arquivar receita', 'Deseja arquivar esta receita?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Arquivar',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsArchiving(true);
            await archive(recipeId);
            Alert.alert('Receita arquivada', 'A receita foi movida para inativas.');
          } catch (archiveError) {
            logError(archiveError, 'recipes.archive');
            Alert.alert('Erro', 'Não foi possível arquivar a receita.');
          } finally {
            setIsArchiving(false);
          }
        },
      },
    ]);
  };

  const handleRestore = () => {
    if (!recipeId || !canManage) {
      return;
    }

    Alert.alert('Restaurar receita', 'Deseja restaurar esta receita?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restaurar',
        onPress: async () => {
          try {
            setIsRestoring(true);
            await restore(recipeId);
            Alert.alert('Receita restaurada', 'A receita voltou a ficar ativa.');
          } catch (restoreError) {
            logError(restoreError, 'recipes.restore');
            Alert.alert('Erro', 'Não foi possível restaurar a receita.');
          } finally {
            setIsRestoring(false);
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    if (!recipeId || !canManage) {
      return;
    }

    Alert.alert(
      'Excluir receita',
      'Esta ação não pode ser desfeita. Deseja excluir a receita permanentemente?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              await remove(recipeId);
              Alert.alert('Receita excluída', 'A receita foi removida.', [
                {
                  text: 'OK',
                  onPress: () => navigation.navigate('Recipes'),
                },
              ]);
            } catch (deleteError) {
              logError(deleteError, 'recipes.delete');
              Alert.alert('Erro', 'Não foi possível excluir a receita.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  const resolveIngredientLabel = (ingredient: IngredientFormValue) => {
    if (!ingredient.referenceId) {
      return 'Selecionar';
    }

    if (ingredient.type === 'product') {
      const product = products.find(item => item.id === ingredient.referenceId);
      return product ? product.name : `Produto ${ingredient.referenceId}`;
    }

    const recipe = recipeOptions.find(item => item.id === ingredient.referenceId);
    return recipe ? recipe.name : `Receita ${ingredient.referenceId}`;
  };

  if (recipeId && !editingRecipe && !isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Receita não encontrada</Text>
          <Text style={styles.emptyMessage}>
            O item pode ter sido removido. Retorne para a lista e selecione novamente.
          </Text>
          <Pressable
            onPress={() => navigation.navigate('Recipes')}
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
            {recipeId
              ? 'Atualize as informações da receita selecionada.'
              : 'Preencha os campos abaixo para cadastrar uma nova receita.'}
          </Text>

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Nome *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Base de pistache"
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
              placeholder="Mistura concentrada para sorvete de pistache"
              style={[styles.input, styles.multilineInput]}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={canManage}
            />
          </View>

          <View style={[styles.formGroup, styles.inlineRow]}>
            <View style={[styles.inlineHalf, styles.inlineHalfSpacing]}>
              <Text style={styles.label}>Rendimento (g) *</Text>
              <TextInput
                value={yieldInGrams}
                onChangeText={setYieldInGrams}
                placeholder="2500"
                style={styles.input}
                keyboardType="numeric"
                editable={canManage}
              />
            </View>
            <View style={[styles.inlineHalf, styles.switchContainer]}>
              <Text style={styles.label}>Receita ativa</Text>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                disabled={!canManage}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Instruções</Text>
            <TextInput
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Descreva o passo a passo do preparo"
              style={[styles.input, styles.multilineInput]}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              editable={canManage}
            />
          </View>

          <Text style={styles.sectionTitle}>Ingredientes *</Text>
          <Text style={styles.sectionDescription}>
            Selecione os produtos ou receitas que compõem esta ficha técnica e informe a
            quantidade em gramas utilizada por batelada.
          </Text>

          <View style={styles.ingredientsList}>
            {ingredients.map((ingredient, index) => (
              <View key={`${ingredient.type}-${index}`} style={styles.ingredientCard}>
                <View style={styles.ingredientHeader}>
                  <Text style={styles.ingredientTitle}>Ingrediente {index + 1}</Text>
                  {ingredients.length > 1 ? (
                    <Pressable
                      onPress={() => handleRemoveIngredient(index)}
                      style={({ pressed }) => [
                        styles.removeChip,
                        pressed && styles.removeChipPressed,
                      ]}
                    >
                      <Text style={styles.removeChipText}>Remover</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.toggleGroup}>
                  <Pressable
                    onPress={() =>
                      handleIngredientChange(index, { type: 'product', referenceId: '' })
                    }
                    style={({ pressed }) => [
                      styles.toggleButton,
                      ingredient.type === 'product' && styles.toggleButtonActive,
                      pressed && styles.toggleButtonPressed,
                    ]}
                    disabled={!canManage}
                  >
                    <Text
                      style={[
                        styles.toggleButtonText,
                        ingredient.type === 'product' && styles.toggleButtonTextActive,
                      ]}
                    >
                      Produto
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      handleIngredientChange(index, { type: 'recipe', referenceId: '' })
                    }
                    style={({ pressed }) => [
                      styles.toggleButton,
                      ingredient.type === 'recipe' && styles.toggleButtonActive,
                      pressed && styles.toggleButtonPressed,
                    ]}
                    disabled={!canManage}
                  >
                    <Text
                      style={[
                        styles.toggleButtonText,
                        ingredient.type === 'recipe' && styles.toggleButtonTextActive,
                      ]}
                    >
                      Receita
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Item selecionado *</Text>
                  <Pressable
                    onPress={() => setPickerState({ index, type: ingredient.type })}
                    style={({ pressed }) => [
                      styles.selector,
                      pressed && styles.selectorPressed,
                    ]}
                    disabled={!canManage}
                  >
                    <Text
                      style={[
                        styles.selectorText,
                        !ingredient.referenceId && styles.selectorPlaceholder,
                      ]}
                    >
                      {resolveIngredientLabel(ingredient)}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Quantidade (g) *</Text>
                  <TextInput
                    value={ingredient.quantity}
                    onChangeText={value =>
                      handleIngredientChange(index, { quantity: value })
                    }
                    placeholder="500"
                    style={styles.input}
                    keyboardType="numeric"
                    editable={canManage}
                  />
                </View>
              </View>
            ))}
          </View>

          <Pressable
            onPress={handleAddIngredient}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            disabled={!canManage}
          >
            <Text style={styles.secondaryButtonText}>Adicionar ingrediente</Text>
          </Pressable>

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
                {recipeId ? 'Salvar alterações' : 'Criar receita'}
              </Text>
            )}
          </Pressable>

          {recipeId ? (
            <View style={styles.dangerZone}>
              <Text style={styles.dangerTitle}>Ações adicionais</Text>
              <Text style={styles.dangerDescription}>
                Arquivar remove a receita das listas ativas sem perder o histórico.
                Excluir é permanente e só deve ser feito para cadastros incorretos.
              </Text>

              <View style={styles.dangerActions}>
                {editingRecipe?.isActive ? (
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
                      <Text style={styles.secondaryButtonText}>Arquivar receita</Text>
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
                      <Text style={styles.secondaryButtonText}>Restaurar receita</Text>
                    )}
                  </Pressable>
                )}

                {!editingRecipe?.isActive ? (
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
                      <Text style={styles.deleteButtonText}>Excluir receita</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <IngredientPickerModal
          visible={Boolean(pickerState)}
          onClose={() => setPickerState(null)}
          type={pickerState?.type}
          onSelect={selectedId => {
            if (pickerState) {
              handleIngredientChange(pickerState.index, { referenceId: selectedId });
            }
            setPickerState(null);
          }}
          products={products}
          recipes={recipeOptions}
        />
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

type IngredientPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (referenceId: string) => void;
  type?: RecipeIngredient['type'];
  products: Product[];
  recipes: Recipe[];
};

function IngredientPickerModal({
  visible,
  onClose,
  onSelect,
  type,
  products,
  recipes,
}: IngredientPickerModalProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const options = useMemo<Product[] | Recipe[]>(() => {
    if (type === 'recipe') {
      return recipes;
    }
    return products;
  }, [products, recipes, type]);

  useEffect(() => {
    if (!visible) {
      setSearchTerm('');
    }
  }, [visible]);

  useEffect(() => {
    setSearchTerm('');
  }, [type]);

  const filteredOptions = useMemo(() => {
    const trimmedTerm = searchTerm.trim();
    const normalizedTerm = trimmedTerm ? normalizeSearchValue(trimmedTerm) : '';

    if (!normalizedTerm) {
      return options;
    }

    return options.filter(option => {
      const normalizedName = normalizeSearchValue(option.name);
      const normalizedDescription = option.description
        ? normalizeSearchValue(option.description)
        : '';
      const normalizedTags =
        'tags' in option && Array.isArray(option.tags)
          ? option.tags.map(normalizeSearchValue).join(' ')
          : '';
      const normalizedBarcode =
        'barcode' in option && option.barcode ? normalizeSearchValue(option.barcode) : '';

      return (
        normalizedName.includes(normalizedTerm) ||
        normalizedDescription.includes(normalizedTerm) ||
        normalizedTags.includes(normalizedTerm) ||
        normalizedBarcode.includes(normalizedTerm)
      );
    });
  }, [options, searchTerm]);

  const title = type === 'recipe' ? 'Selecionar receita' : 'Selecionar produto';
  const searchPlaceholder = options.length
    ? type === 'recipe'
      ? 'Buscar receita...'
      : 'Buscar produto...'
    : 'Nenhum item disponível';

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.modalCloseButton,
                pressed && styles.modalCloseButtonPressed,
              ]}
            >
              <Text style={styles.modalClose}>Fechar</Text>
            </Pressable>
          </View>
          {type === 'product' ? (
            <BarcodeScannerField
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder={searchPlaceholder}
              placeholderTextColor="#9CA3AF"
              containerStyle={styles.modalSearchFieldContainer}
              inputStyle={styles.modalSearchInput}
              editable={options.length > 0}
            />
          ) : (
            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder={searchPlaceholder}
              style={[styles.modalSearchInput, styles.modalSearchInputSpacing]}
              autoCorrect={false}
              autoCapitalize="none"
              editable={options.length > 0}
            />
          )}
          <ScrollView
            contentContainerStyle={styles.modalList}
            keyboardShouldPersistTaps="handled"
          >
            {options.length ? (
              filteredOptions.length ? (
                filteredOptions.map(option => (
                  <Pressable
                    key={option.id}
                    onPress={() => onSelect(option.id)}
                    style={({ pressed }) => [
                      styles.modalOption,
                      pressed && styles.modalOptionPressed,
                    ]}
                  >
                    <Text style={styles.modalOptionTitle}>{option.name}</Text>
                    {option.description ? (
                      <Text style={styles.modalOptionSubtitle}>{option.description}</Text>
                    ) : null}
                    {!option.isActive ? (
                      <Text style={styles.modalBadge}>Inativo</Text>
                    ) : null}
                  </Pressable>
                ))
              ) : (
                <Text style={styles.modalEmptyResults}>Nenhum item encontrado.</Text>
              )
            ) : (
              <Text style={styles.modalEmpty}>Nenhum item disponível.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  errorText: {
    color: '#E53E3E',
    fontSize: 14,
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  multilineInput: {
    minHeight: 120,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  inlineHalf: {
    flex: 1,
  },
  inlineHalfSpacing: {
    paddingRight: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 8,
    paddingRight: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#4B5563',
  },
  ingredientsList: {
    gap: 12,
  },
  ingredientCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ingredientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ingredientTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  removeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
  },
  removeChipPressed: {
    opacity: 0.7,
  },
  removeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#34D399',
  },
  toggleButtonPressed: {
    opacity: 0.8,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  toggleButtonTextActive: {
    color: '#047857',
  },
  selector: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  selectorPressed: {
    opacity: 0.85,
  },
  selectorText: {
    fontSize: 15,
    color: '#111827',
  },
  selectorPlaceholder: {
    color: '#9CA3AF',
  },
  secondaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  primaryButton: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4E9F3D',
    alignItems: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dangerZone: {
    marginTop: 32,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 8,
  },
  dangerDescription: {
    fontSize: 14,
    color: '#7F1D1D',
    marginBottom: 12,
  },
  dangerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  deleteButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  deleteButtonPressed: {
    opacity: 0.8,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptyMessage: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalClose: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4E9F3D',
  },
  modalSearchInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  modalSearchInputSpacing: {
    marginHorizontal: 24,
    marginTop: 16,
  },
  modalSearchFieldContainer: {
    marginHorizontal: 24,
    marginTop: 16,
  },
  modalList: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  modalCloseButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalCloseButtonPressed: {
    backgroundColor: '#F3F4F6',
  },
  modalOption: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  modalOptionPressed: {
    backgroundColor: '#F3F4F6',
  },
  modalOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalOptionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  modalBadge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
  },
  modalEmpty: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
  },
  modalEmptyResults: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
    paddingVertical: 24,
  },
});
