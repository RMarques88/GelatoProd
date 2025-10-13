import {
  completeProductionPlanWithConsumption,
  startProductionPlanExecution,
} from '@/services/productionExecution';

import type {
  ProductionDivergence,
  ProductionPlan,
  ProductionStage,
  Recipe,
  StockItem,
  StockMovement,
  ProductionPlanAvailabilityRecord,
} from '@/domain';

const mockGetProductionPlanById = jest.fn();
const mockUpdateProductionPlan = jest.fn();

const mockListProductionStages = jest.fn();
const mockUpdateProductionStage = jest.fn();

const mockGetRecipeById = jest.fn();

const mockListStockItems = jest.fn();
const mockAdjustStockLevel = jest.fn();

const mockCreateProductionDivergence = jest.fn();

const mockCreateNotification = jest.fn();
const mockFindAvailabilityRecord = jest.fn();
const mockUpdateAvailabilityRecord = jest.fn();

jest.mock('@/services/firestore/productionService', () => ({
  getProductionPlanById: (...args: unknown[]) => mockGetProductionPlanById(...args),
  updateProductionPlan: (...args: unknown[]) => mockUpdateProductionPlan(...args),
}));
jest.mock('@/services/firestore/productionStagesService', () => ({
  listProductionStages: (...args: unknown[]) => mockListProductionStages(...args),
  updateProductionStage: (...args: unknown[]) => mockUpdateProductionStage(...args),
}));

jest.mock('@/services/firestore/recipesService', () => ({
  getRecipeById: (...args: unknown[]) => mockGetRecipeById(...args),
}));

jest.mock('@/services/firestore/stockService', () => ({
  listStockItems: (...args: unknown[]) => mockListStockItems(...args),
  adjustStockLevel: (...args: unknown[]) => mockAdjustStockLevel(...args),
}));

jest.mock('@/services/firestore/productionDivergencesService', () => ({
  createProductionDivergence: (...args: unknown[]) =>
    mockCreateProductionDivergence(...args),
}));

jest.mock('@/services/firestore/notificationsService', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

jest.mock('@/services/firestore/productionAvailabilityService', () => ({
  findProductionPlanAvailabilityRecordByPlanId: (...args: unknown[]) =>
    mockFindAvailabilityRecord(...args),
  updateProductionPlanAvailabilityRecord: (...args: unknown[]) =>
    mockUpdateAvailabilityRecord(...args),
}));
describe('completeProductionPlanWithConsumption', () => {
  const mockPlan: ProductionPlan = {
    id: 'plan-1',
    recipeId: 'recipe-root',
    recipeName: 'Gelato encadeado',
    sequenceNumber: 1,
    code: 'PLN-001',
    scheduledFor: new Date('2025-01-01T10:00:00Z'),
    quantityInUnits: 1000,
    unitOfMeasure: 'GRAMS',
    notes: undefined,
    status: 'in_progress',
    requestedBy: 'user-1',
    startedAt: new Date('2025-01-01T10:05:00Z'),
    completedAt: null,
    actualQuantityInUnits: null,
    createdAt: new Date('2024-12-15T12:00:00Z'),
    updatedAt: new Date('2024-12-20T12:00:00Z'),
    archivedAt: null,
  };

  const rootRecipe: Recipe = {
    id: 'recipe-root',
    name: 'Gelato especial',
    description: 'Receita principal',
    yieldInGrams: 1000,
    ingredients: [
      {
        type: 'recipe',
        referenceId: 'recipe-base',
        quantityInGrams: 1000,
      },
    ],
    instructions: 'Misture e congele.',
    isActive: true,
    createdAt: new Date('2024-01-01T12:00:00Z'),
    updatedAt: new Date('2024-01-01T12:00:00Z'),
    archivedAt: null,
  };

  const baseRecipe: Recipe = {
    id: 'recipe-base',
    name: 'Base de leite',
    description: 'Mistura de leite integral',
    yieldInGrams: 1000,
    ingredients: [
      {
        type: 'product',
        referenceId: 'product-milk',
        quantityInGrams: 1000,
      },
    ],
    instructions: 'Aquecer e resfriar.',
    isActive: true,
    createdAt: new Date('2024-01-01T12:00:00Z'),
    updatedAt: new Date('2024-01-01T12:00:00Z'),
    archivedAt: null,
  };

  const stockItem: StockItem = {
    id: 'stock-1',
    productId: 'product-milk',
    currentQuantityInGrams: 650,
    minimumQuantityInGrams: 200,
    lastMovementId: null,
    createdAt: new Date('2024-12-01T12:00:00Z'),
    updatedAt: new Date('2024-12-20T12:00:00Z'),
    archivedAt: null,
    highestUnitCostInBRL: 0,
  };

  const stage: ProductionStage = {
    id: 'stage-1',
    planId: 'plan-1',
    name: 'Mistura',
    description: 'Misturar ingredientes',
    sequence: 1,
    status: 'pending',
    assignedTo: null,
    scheduledStart: null,
    scheduledEnd: null,
    startedAt: null,
    completedAt: null,
    notes: undefined,
    createdAt: new Date('2024-12-20T12:00:00Z'),
    updatedAt: new Date('2024-12-20T12:00:00Z'),
    archivedAt: null,
  };

  const movement: StockMovement = {
    id: 'movement-1',
    productId: 'product-milk',
    stockItemId: 'stock-1',
    type: 'decrement',
    quantityInGrams: 650,
    previousQuantityInGrams: 650,
    resultingQuantityInGrams: 0,
    performedBy: 'user-operator',
    performedAt: new Date('2025-01-01T12:00:00Z'),
  };

  const divergence: ProductionDivergence = {
    id: 'divergence-1',
    planId: 'plan-1',
    stageId: null,
    reportedBy: 'user-operator',
    resolvedBy: null,
    status: 'open',
    severity: 'medium',
    type: 'ingredient_shortage',
    description: 'Consumo parcial do produto product-milk.',
    expectedQuantityInUnits: 1000,
    actualQuantityInUnits: 650,
    resolutionNotes: undefined,
    resolvedAt: null,
    createdAt: new Date('2025-01-01T12:01:00Z'),
    updatedAt: new Date('2025-01-01T12:01:00Z'),
    archivedAt: null,
  };

  const availabilityRecord: ProductionPlanAvailabilityRecord = {
    id: 'availability-1',
    planId: mockPlan.id,
    planCode: mockPlan.code,
    recipeId: mockPlan.recipeId,
    recipeName: mockPlan.recipeName,
    scheduledFor: mockPlan.scheduledFor,
    quantityInUnits: mockPlan.quantityInUnits,
    unitOfMeasure: mockPlan.unitOfMeasure,
    status: 'insufficient' as const,
    confirmedBy: 'user-supervisor',
    confirmedAt: new Date('2024-12-31T23:00:00Z'),
    shortages: [
      {
        productId: 'product-milk',
        requiredQuantityInGrams: 1000,
        availableQuantityInGrams: 650,
        shortageInGrams: 350,
        minimumQuantityInGrams: 200,
      },
    ],
    totalRequiredInGrams: 1000,
    totalAvailableInGrams: 650,
    totalShortageInGrams: 350,
    notes: null,
    executionStartedAt: null,
    executionCompletedAt: null,
    actualConsumedInGrams: null,
    actualShortageInGrams: null,
    createdAt: new Date('2024-12-31T23:00:00Z'),
    updatedAt: new Date('2024-12-31T23:00:00Z'),
    archivedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetProductionPlanById.mockResolvedValue(mockPlan);

    mockUpdateProductionPlan.mockResolvedValue({
      ...mockPlan,
      status: 'completed',
      completedAt: new Date('2025-01-01T12:05:00Z'),
      actualQuantityInUnits: 650,
    });

    mockFindAvailabilityRecord.mockResolvedValue(availabilityRecord);

    mockUpdateAvailabilityRecord.mockResolvedValue({
      ...availabilityRecord,
      status: 'reconciled',
      executionStartedAt: mockPlan.startedAt,
      executionCompletedAt: new Date('2025-01-01T12:05:00Z'),
      actualConsumedInGrams: 650,
      actualShortageInGrams: 350,
    });

    mockListProductionStages.mockResolvedValue([stage]);

    mockUpdateProductionStage.mockImplementation(async () => ({
      ...stage,
      status: 'completed',
      completedAt: new Date('2025-01-01T12:03:00Z'),
    }));

    mockGetRecipeById.mockImplementation(async (recipeId: string) => {
      if (recipeId === 'recipe-root') {
        return rootRecipe;
      }

      if (recipeId === 'recipe-base') {
        return baseRecipe;
      }

      throw new Error(`Unexpected recipe id ${recipeId}`);
    });

    mockListStockItems.mockImplementation(
      async ({ productId }: { productId: string }) => {
        if (productId === 'product-milk') {
          return [stockItem];
        }

        return [];
      },
    );

    mockAdjustStockLevel.mockResolvedValue(movement);

    mockCreateProductionDivergence.mockResolvedValue(divergence);

    mockCreateNotification.mockResolvedValue(undefined);
  });

  it('consumes estoque e registra divergência quando receita encadeada está sem insumos suficientes', async () => {
    const result = await completeProductionPlanWithConsumption({
      planId: 'plan-1',
      performedBy: 'user-operator',
    });

    expect(mockGetRecipeById).toHaveBeenCalledWith('recipe-root');
    expect(mockGetRecipeById).toHaveBeenCalledWith('recipe-base');

    expect(mockListStockItems).toHaveBeenCalledWith({ productId: 'product-milk' });
    expect(mockAdjustStockLevel).toHaveBeenCalledWith(
      expect.objectContaining({
        stockItemId: 'stock-1',
        quantityInGrams: 650,
        type: 'decrement',
        performedBy: 'user-operator',
      }),
    );

    expect(mockCreateProductionDivergence).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedQuantityInUnits: 1000,
        actualQuantityInUnits: 650,
        planId: 'plan-1',
      }),
    );

    const divergencePayload = mockCreateProductionDivergence.mock.calls[0][0];
    expect(divergencePayload.description).toContain('Falta prevista');

    expect(mockUpdateProductionPlan).toHaveBeenCalledWith(
      'plan-1',
      expect.objectContaining({
        status: 'completed',
        actualQuantityInUnits: 650,
      }),
    );

    expect(mockFindAvailabilityRecord).toHaveBeenCalledWith('plan-1');
    expect(mockUpdateAvailabilityRecord).toHaveBeenCalledWith(
      'availability-1',
      expect.objectContaining({
        status: 'reconciled',
        actualConsumedInGrams: 650,
        actualShortageInGrams: 350,
        executionCompletedAt: expect.any(Date),
      }),
    );

    expect(result.adjustments).toHaveLength(1);
    expect(result.divergences).toHaveLength(1);
    expect(result.divergences[0].expectedQuantityInUnits).toBe(1000);
    expect(result.divergences[0].actualQuantityInUnits).toBe(650);
  });

  it('marca o início da execução na disponibilidade ao iniciar o plano', async () => {
    const startedAt = new Date('2025-01-01T10:06:00Z');

    mockUpdateProductionPlan.mockResolvedValueOnce({
      ...mockPlan,
      status: 'in_progress',
      startedAt,
    });

    await startProductionPlanExecution('plan-1');

    expect(mockFindAvailabilityRecord).toHaveBeenCalledWith('plan-1');
    expect(mockUpdateAvailabilityRecord).toHaveBeenCalledWith(
      'availability-1',
      expect.objectContaining({
        executionStartedAt: expect.any(Date),
      }),
    );
  });
});
