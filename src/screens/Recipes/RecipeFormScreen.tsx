import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

import type { AppStackParamList } from '@/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BarcodeScannerField } from '@/components/inputs/BarcodeScannerField';
import { ProductPickerModal } from '@/components/inputs/ProductPickerModal';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { Product, Recipe, RecipeIngredient } from '@/domain';
import { useProducts, useRecipes, usePricingSettings, useStockItems } from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { logError } from '@/utils/logger';
// type imports moved above

type IngredientFormValue = {
  type: RecipeIngredient['type'];
  referenceId: string;
  quantity: string;
  estimatedCostInBRL?: number; // local-only estimated cost for this ingredient
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
  const { stockItems } = useStockItems({ includeArchived: true });
  const { settings: pricingSettings, update: updatePricingSettings } = usePricingSettings(
    { enabled: true },
  );

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
  const totalIngredientsInGrams = useMemo(() => {
    return ingredients.reduce((sum, ing) => {
      const qty = Number(ing.quantity.replace(',', '.'));
      return sum + (Number.isFinite(qty) ? qty : 0);
    }, 0);
  }, [ingredients]);
  const yieldHeuristicWarning = useMemo(() => {
    const yieldValue = Number(yieldInGrams.replace(',', '.'));
    if (!Number.isFinite(yieldValue) || yieldValue <= 0) return null;
    if (totalIngredientsInGrams <= 0) return null;
    const diff = Math.abs(yieldValue - totalIngredientsInGrams);
    const tolerance = Math.max(100, totalIngredientsInGrams * 0.05); // 5% or 100g
    if (diff > tolerance) {
      return 'Atenção: O rendimento em gramas difere significativamente da soma dos ingredientes (heurística 1L≈1Kg). Revise as quantidades.';
    }
    return null;
  }, [totalIngredientsInGrams, yieldInGrams]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pickerState, setPickerState] = useState<PickerState | null>(null);
  const [accessoryOverrides, setAccessoryOverrides] = useState<
    Array<{ productId: string; defaultQtyPerPortion: number }>
  >([]);
  const [isAccessoryModalOpen, setIsAccessoryModalOpen] = useState(false);
  const existingOverrides =
    pricingSettings?.accessories?.overridesByRecipeId?.[recipeId ?? ''];

  useEffect(() => {
    if (recipeId && existingOverrides) {
      setAccessoryOverrides(existingOverrides.map(i => ({ ...i })));
    } else if (!recipeId) {
      setAccessoryOverrides([]);
    }
  }, [recipeId, existingOverrides]);

  const saveAccessoryOverrides = useCallback(async () => {
    if (!recipeId) return;
    const current = pricingSettings?.accessories ?? {
      items: [],
      overridesByRecipeId: {},
    };
    await updatePricingSettings({
      accessories: {
        items: current.items ?? [],
        overridesByRecipeId: {
          ...(current.overridesByRecipeId ?? {}),
          [recipeId]: accessoryOverrides,
        },
      },
    });
    Alert.alert('Overrides salvos', 'Acessórios específicos desta receita foram salvos.');
  }, [accessoryOverrides, pricingSettings?.accessories, recipeId, updatePricingSettings]);

  const revertAccessoryOverrides = useCallback(async () => {
    if (!recipeId) return;
    const current = pricingSettings?.accessories ?? {
      items: [],
      overridesByRecipeId: {},
    };
    const nextOverrides = { ...(current.overridesByRecipeId ?? {}) };
    delete nextOverrides[recipeId];
    await updatePricingSettings({
      accessories: {
        items: current.items ?? [],
        overridesByRecipeId: nextOverrides,
      },
    });
    setAccessoryOverrides([]);
    Alert.alert(
      'Overrides removidos',
      'Esta receita voltou a usar os acessórios globais.',
    );
  }, [pricingSettings?.accessories, recipeId, updatePricingSettings]);

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

  const computeIngredientEstimatedCost = useCallback(
    (ingredient: IngredientFormValue) => {
      if (!ingredient.referenceId) return 0;
      if (ingredient.type !== 'product') return 0; // skip recipes for now
      const product = products.find(p => p.id === ingredient.referenceId);
      if (!product) return 0;
      const stock = stockItems.find(s => s.productId === product.id);
      const unitCost = stock?.averageUnitCostInBRL ?? stock?.highestUnitCostInBRL ?? 0;
      const qty = Number(ingredient.quantity.replace(',', '.'));
      if (!Number.isFinite(qty) || qty <= 0) return 0;

      // convert product unit to grams if necessary
      const unit = product.unitOfMeasure ?? 'GRAMS';
      let grams = qty;
      if (unit === 'KILOGRAMS') grams = qty * 1000;
      if (unit === 'LITERS') grams = qty * 1000;
      if (unit === 'MILLILITERS') grams = qty;

      // UNITS treated as unit count: multiply count * unitCost
      if (unit === 'UNITS') return qty * unitCost;

      // unitCost is stored per gram in this app convention (some items use per-kg but tests show small numbers),
      // but many places expect averageUnitCostInBRL to be per gram. If the unitCost seems like per-kg (>1),
      // we still multiply grams * unitCost because elsewhere they do unitCost * grams.
      return grams * unitCost;
    },
    [products, stockItems],
  );

  const estimatedTotalCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => {
      const cost = ing.estimatedCostInBRL ?? computeIngredientEstimatedCost(ing);
      return sum + (Number.isFinite(cost) ? cost : 0);
    }, 0);
  }, [ingredients, computeIngredientEstimatedCost]);

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
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid
          extraScrollHeight={Platform.OS === 'android' ? 20 : 0}
        >
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {recipeId && existingOverrides && existingOverrides.length > 0 ? (
              <Text style={styles.overrideBadge}>Overrides ativos</Text>
            ) : null}
          </View>
          <Text style={styles.subtitle}>
            {recipeId
              ? 'Edite os campos abaixo para alterar a receita.'
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
              {yieldHeuristicWarning ? (
                <Text style={styles.hintText}>{yieldHeuristicWarning}</Text>
              ) : null}
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
                  <View style={styles.qtyRow}>
                    <TextInput
                      value={ingredient.quantity}
                      onChangeText={value =>
                        handleIngredientChange(index, { quantity: value })
                      }
                      placeholder="500"
                      style={[styles.input, styles.qtyInput]}
                      keyboardType="numeric"
                      editable={canManage}
                    />
                    <Pressable
                      onPress={() => {
                        const cost = computeIngredientEstimatedCost(ingredient);
                        handleIngredientChange(index, { estimatedCostInBRL: cost });
                      }}
                      style={({ pressed }) => [
                        styles.estimateBtn,
                        pressed && styles.estimateBtnPressed,
                      ]}
                      disabled={!canManage}
                    >
                      <Ionicons name="calculator-outline" size={20} color="#1F2937" />
                    </Pressable>
                  </View>
                  {typeof ingredient.estimatedCostInBRL === 'number' ? (
                    <Text style={styles.hintText}>
                      Custo estimado: R$ {ingredient.estimatedCostInBRL.toFixed(2)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          <View>
            <View style={styles.estimatedSummary}>
              <Text style={styles.estimatedSummaryText}>
                Custo estimado da receita: R$ {estimatedTotalCost.toFixed(2)}
              </Text>
            </View>
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

          {recipeId ? (
            <View style={styles.accessoryCard}>
              <View style={styles.accessoryHeaderRow}>
                <Text style={styles.accessorySectionTitle}>
                  Overrides de acessórios (Qtd por 100 g)
                </Text>
                <Pressable
                  onPress={() => setIsAccessoryModalOpen(true)}
                  style={({ pressed }) => [
                    styles.accessoryAddBtn,
                    pressed && styles.accessoryAddBtnPressed,
                  ]}
                >
                  <Text style={styles.accessoryAddBtnText}>Adicionar</Text>
                </Pressable>
              </View>
              {accessoryOverrides.length === 0 ? (
                <Text style={styles.accessoryHelperText}>
                  Sem overrides específicos. Serão usados os acessórios globais
                  configurados em Preço de venda.
                </Text>
              ) : (
                accessoryOverrides.map((item, idx) => {
                  const product = products.find(p => p.id === item.productId);
                  const unit =
                    (product?.unitOfMeasure ?? 'UNITS') === 'UNITS'
                      ? 'un'
                      : (product?.unitOfMeasure ?? 'GRAMS').toLowerCase();
                  return (
                    <View key={`${item.productId}-${idx}`} style={styles.accessoryRow}>
                      <View style={styles.flex1}>
                        <Text style={styles.accessoryName} numberOfLines={1}>
                          {product?.name ?? item.productId}
                        </Text>
                        <Text style={styles.accessoryMeta}>Unidade: {unit}</Text>
                      </View>
                      <TextInput
                        style={styles.accessoryQtyInput}
                        keyboardType="decimal-pad"
                        value={String(item.defaultQtyPerPortion)}
                        onChangeText={value => {
                          const parsed = Number(value.replace(',', '.'));
                          setAccessoryOverrides(prev =>
                            prev.map((o, i) =>
                              i === idx
                                ? {
                                    ...o,
                                    defaultQtyPerPortion: Number.isFinite(parsed)
                                      ? parsed
                                      : 0,
                                  }
                                : o,
                            ),
                          );
                        }}
                      />
                      <Pressable
                        onPress={() =>
                          setAccessoryOverrides(prev => prev.filter((_, i) => i !== idx))
                        }
                        style={({ pressed }) => [
                          styles.accessoryRemoveBtn,
                          pressed && styles.accessoryRemoveBtnPressed,
                        ]}
                      >
                        <Ionicons name="trash-outline" size={18} color="#B91C1C" />
                      </Pressable>
                    </View>
                  );
                })
              )}
              {recipeId ? (
                <View style={styles.overrideActionsRow}>
                  {accessoryOverrides.length > 0 ? (
                    <Pressable
                      disabled={!canManage}
                      onPress={saveAccessoryOverrides}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        pressed && styles.primaryButtonPressed,
                        styles.overrideActionButton,
                        !canManage && styles.disabledButton,
                      ]}
                    >
                      <Text style={styles.primaryButtonText}>Salvar overrides</Text>
                    </Pressable>
                  ) : null}
                  {existingOverrides && existingOverrides.length > 0 ? (
                    <Pressable
                      disabled={!canManage}
                      onPress={revertAccessoryOverrides}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        pressed && styles.secondaryButtonPressed,
                        styles.overrideActionButton,
                        !canManage && styles.disabledSecondaryButton,
                      ]}
                    >
                      <Text style={styles.secondaryButtonText}>
                        Reverter para globais
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

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
        </KeyboardAwareScrollView>

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
      <ProductPickerModal
        visible={isAccessoryModalOpen}
        products={products}
        excludedProductIds={accessoryOverrides.map(a => a.productId)}
        onConfirm={selected => {
          if (!selected.length) {
            setIsAccessoryModalOpen(false);
            return;
          }
          setAccessoryOverrides(prev => [
            ...prev,
            ...selected.map(s => ({ productId: s.id, defaultQtyPerPortion: 1 })),
          ]);
          setIsAccessoryModalOpen(false);
        }}
        onClose={() => setIsAccessoryModalOpen(false)}
        title="Selecionar acessórios (override)"
        subtitle="Itens específicos desta receita substituem os globais"
      />
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
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalList}
            keyboardShouldPersistTaps="handled"
            enableOnAndroid
            extraScrollHeight={Platform.OS === 'android' ? 20 : 0}
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
          </KeyboardAwareScrollView>
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
  hintText: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 6,
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
  accessoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  accessoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accessorySectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    paddingRight: 12,
  },
  accessoryAddBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#111827',
  },
  accessoryAddBtnPressed: { opacity: 0.85 },
  accessoryAddBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  accessoryHelperText: { fontSize: 12, color: '#6B7280' },
  accessoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accessoryName: { fontSize: 14, fontWeight: '500', color: '#1F2937' },
  accessoryMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  accessoryQtyInput: {
    width: 70,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'right',
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  accessoryRemoveBtn: { padding: 6, borderRadius: 8, backgroundColor: '#FEE2E2' },
  accessoryRemoveBtnPressed: { opacity: 0.8 },
  overrideActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  overrideActionButton: { flex: 1 },
  flex1: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  overrideBadge: {
    backgroundColor: '#1F2937',
    color: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledSecondaryButton: {
    opacity: 0.5,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyInput: {
    flex: 1,
  },
  estimateBtn: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  estimateBtnPressed: {
    opacity: 0.8,
  },
  estimatedSummary: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  estimatedSummaryText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
});
