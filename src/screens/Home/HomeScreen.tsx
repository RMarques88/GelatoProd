import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { useProducts, useRecipes, useStockItems } from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';

export function HomeScreen() {
  const { signOut, isLoading } = useAuth();
  const {
    products,
    isLoading: isLoadingProducts,
    error: productsError,
    create: createProduct,
  } = useProducts({ suspense: true });
  const {
    recipes,
    isLoading: isLoadingRecipes,
    error: recipesError,
  } = useRecipes({ suspense: true });
  const {
    stockItems,
    isLoading: isLoadingStock,
    error: stockError,
  } = useStockItems({ suspense: true });

  const [newProductName, setNewProductName] = useState('');
  const [newProductWeight, setNewProductWeight] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const activeProducts = useMemo(
    () => products.filter(product => product.isActive),
    [products],
  );

  const criticalStock = useMemo(
    () =>
      stockItems.filter(
        item =>
          item.archivedAt === null &&
          item.currentQuantityInGrams <= item.minimumQuantityInGrams,
      ),
    [stockItems],
  );

  const handleCreateProduct = async () => {
    const weight = Number(newProductWeight.replace(',', '.'));
    const price = Number(newProductPrice.replace(',', '.'));

    if (!newProductName.trim()) {
      setFormError('Informe o nome do produto.');
      return;
    }

    if (Number.isNaN(weight) || weight <= 0) {
      setFormError('Peso unitário inválido.');
      return;
    }

    if (Number.isNaN(price) || price <= 0) {
      setFormError('Preço por grama inválido.');
      return;
    }

    try {
      setFormError(null);
      setIsSubmittingProduct(true);
      await createProduct({
        name: newProductName.trim(),
        unitWeightInGrams: weight,
        pricePerGram: price,
        tags: [],
      });
      setNewProductName('');
      setNewProductWeight('');
      setNewProductPrice('');
    } catch (creationError) {
      setFormError(
        creationError instanceof Error
          ? creationError.message
          : 'Não foi possível criar o produto.',
      );
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Painel da Gelateria</Text>
            <Text style={styles.subtitle}>Acompanhe os cadastros em tempo real.</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={signOut}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Sair</Text>
          </Pressable>
        </View>

        <View style={styles.metricsRow}>
          <MetricCard
            label="Produtos ativos"
            value={isLoadingProducts ? undefined : activeProducts.length}
            isLoading={isLoadingProducts}
          />
          <MetricCard
            label="Receitas"
            value={isLoadingRecipes ? undefined : recipes.length}
            isLoading={isLoadingRecipes}
          />
          <MetricCard
            label="Alertas de estoque"
            value={isLoadingStock ? undefined : criticalStock.length}
            isLoading={isLoadingStock}
            highlight={criticalStock.length > 0}
          />
        </View>

        <Section title="Produtos" error={productsError?.message}>
          {isLoadingProducts ? (
            <ActivityIndicator color="#4E9F3D" />
          ) : products.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum produto cadastrado até o momento.</Text>
          ) : (
            products.slice(0, 5).map(product => (
              <View key={product.id} style={styles.listItem}>
                <View>
                  <Text style={styles.listItemTitle}>{product.name}</Text>
                  <Text style={styles.listItemSubtitle}>
                    {product.unitWeightInGrams}g · R${' '}
                    {product.pricePerGram.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    /g
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    !product.isActive && styles.statusBadgeInactive,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {product.isActive ? 'Ativo' : 'Inativo'}
                  </Text>
                </View>
              </View>
            ))
          )}

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Cadastrar produto rápido</Text>
            <TextInput
              placeholder="Nome do produto"
              value={newProductName}
              onChangeText={setNewProductName}
              style={styles.input}
            />
            <View style={styles.formRow}>
              <TextInput
                placeholder="Peso (g)"
                keyboardType="numeric"
                value={newProductWeight}
                onChangeText={setNewProductWeight}
                style={[styles.input, styles.inputHalf]}
              />
              <TextInput
                placeholder="Preço/g"
                keyboardType="numeric"
                value={newProductPrice}
                onChangeText={setNewProductPrice}
                style={[styles.input, styles.inputHalf]}
              />
            </View>
            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
            <Pressable
              onPress={handleCreateProduct}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
              disabled={isSubmittingProduct}
            >
              {isSubmittingProduct ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Salvar produto</Text>
              )}
            </Pressable>
          </View>
        </Section>

        <Section title="Receitas" error={recipesError?.message}>
          {isLoadingRecipes ? (
            <ActivityIndicator color="#4E9F3D" />
          ) : recipes.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma receita registrada ainda.</Text>
          ) : (
            recipes.slice(0, 5).map(recipe => (
              <View key={recipe.id} style={styles.listItem}>
                <View>
                  <Text style={styles.listItemTitle}>{recipe.name}</Text>
                  <Text style={styles.listItemSubtitle}>
                    Rendimento: {recipe.yieldInGrams}g • {recipe.ingredients.length}{' '}
                    ingredientes
                  </Text>
                </View>
              </View>
            ))
          )}
        </Section>

        <Section title="Estoque" error={stockError?.message}>
          {isLoadingStock ? (
            <ActivityIndicator color="#4E9F3D" />
          ) : stockItems.length === 0 ? (
            <Text style={styles.emptyText}>
              Cadastre produtos para começar o controle.
            </Text>
          ) : (
            stockItems.slice(0, 5).map(item => (
              <View key={item.id} style={styles.listItem}>
                <View>
                  <Text style={styles.listItemTitle}>Produto #{item.productId}</Text>
                  <Text style={styles.listItemSubtitle}>
                    {item.currentQuantityInGrams}g disponíveis · mínimo{' '}
                    {item.minimumQuantityInGrams}g
                  </Text>
                </View>
                {item.currentQuantityInGrams <= item.minimumQuantityInGrams ? (
                  <View style={[styles.statusBadge, styles.statusBadgeAlert]}>
                    <Text style={styles.statusBadgeText}>Crítico</Text>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </Section>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  subtitle: {
    fontSize: 16,
    color: '#5E5F61',
    marginTop: 4,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#E53E3E',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  metricLabel: {
    fontSize: 13,
    color: '#5E5F61',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1B1E',
  },
  metricHighlight: {
    color: '#E53E3E',
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  sectionError: {
    fontSize: 13,
    color: '#E53E3E',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  listItemSubtitle: {
    fontSize: 13,
    color: '#5E5F61',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#5E5F61',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
  },
  statusBadgeInactive: {
    backgroundColor: '#E2E8F0',
  },
  statusBadgeAlert: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  formCard: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D4D5D8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputHalf: {
    flex: 1,
  },
  errorText: {
    color: '#E53E3E',
    fontSize: 13,
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#4E9F3D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default HomeScreen;

type MetricCardProps = {
  label: string;
  value?: number;
  isLoading?: boolean;
  highlight?: boolean;
};

function MetricCard({ label, value, isLoading, highlight }: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      {isLoading ? (
        <ActivityIndicator color="#4E9F3D" />
      ) : (
        <Text style={[styles.metricValue, highlight && styles.metricHighlight]}>
          {value ?? 0}
        </Text>
      )}
    </View>
  );
}

type SectionProps = {
  title: string;
  children: ReactNode;
  error?: string;
};

function Section({ title, children, error }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {error ? <Text style={styles.sectionError}>{error}</Text> : null}
      </View>
      {children}
    </View>
  );
}
