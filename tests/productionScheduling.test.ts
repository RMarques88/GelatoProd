import {
  checkProductionPlanAvailability,
  scheduleProductionPlan,
} from '@/services/productionScheduling';
import type { Recipe } from '@/domain';
import type { PlanAvailabilityResult } from '@/services/productionScheduling';

const mockCreateProductionPlan = jest.fn();
const mockCreateAvailabilityRecord = jest.fn();
const mockResolveProductRequirements = jest.fn();
const mockListStockItems = jest.fn();

jest.mock('@/services/firestore/productionService', () => ({
  createProductionPlan: (...args: unknown[]) => mockCreateProductionPlan(...args),
}));

jest.mock('@/services/firestore/productionAvailabilityService', () => ({
  createProductionPlanAvailabilityRecord: (...args: unknown[]) =>
    mockCreateAvailabilityRecord(...args),
}));

jest.mock('@/services/productionRequirements', () => ({
  resolveProductRequirements: (...args: unknown[]) =>
    mockResolveProductRequirements(...args),
}));

jest.mock('@/services/firestore/stockService', () => ({
  listStockItems: (...args: unknown[]) => mockListStockItems(...args),
}));

jest.mock('@/services/firestore/recipesService', () => ({
  getRecipeById: jest.fn(),
}));

describe('productionScheduling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects shortages when stock is insufficient', async () => {
    const recipe: Recipe = {
      id: 'recipe-vanilla',
      name: 'Sorvete de Baunilha',
      description: 'Cremoso e clássico',
      yieldInGrams: 1000,
      ingredients: [],
      instructions: undefined,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    };

    mockResolveProductRequirements.mockResolvedValue(new Map([['product-milk', 1200]]));

    mockListStockItems.mockResolvedValue([
      {
        id: 'stock-1',
        productId: 'product-milk',
        currentQuantityInGrams: 400,
        minimumQuantityInGrams: 150,
        lastMovementId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        highestUnitCostInBRL: 0,
      },
    ]);

    const availability = await checkProductionPlanAvailability({
      recipeId: 'recipe-vanilla',
      quantityInUnits: 1000,
      unitOfMeasure: 'GRAMS',
      recipeOverride: recipe,
    });

    expect(mockResolveProductRequirements).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityInUnits: 1000,
        unitOfMeasure: 'GRAMS',
        recipe,
      }),
    );

    expect(mockListStockItems).toHaveBeenCalledWith({ productId: 'product-milk' });
    expect(availability.status).toBe('insufficient');
    expect(availability.shortages).toHaveLength(1);
    expect(availability.shortages[0].shortageInGrams).toBeCloseTo(800);
    expect(availability.totalShortageInGrams).toBeCloseTo(800);
  });

  it('records availability decision when scheduling with shortages', async () => {
    const availability: PlanAvailabilityResult = {
      status: 'insufficient',
      items: [
        {
          productId: 'product-milk',
          requiredQuantityInGrams: 1000,
          availableQuantityInGrams: 400,
          shortageInGrams: 600,
          minimumQuantityInGrams: 150,
        },
      ],
      shortages: [
        {
          productId: 'product-milk',
          requiredQuantityInGrams: 1000,
          availableQuantityInGrams: 400,
          shortageInGrams: 600,
          minimumQuantityInGrams: 150,
        },
      ],
      totalRequiredInGrams: 1000,
      totalAvailableInGrams: 400,
      totalShortageInGrams: 600,
      totalEstimatedCostInBRL: 1250,
    };

    const plan = {
      id: 'plan-1',
      recipeId: 'recipe-vanilla',
      recipeName: 'Sorvete de Baunilha',
      sequenceNumber: 1,
      code: 'PLN-001',
      scheduledFor: new Date('2025-01-01T09:00:00Z'),
      quantityInUnits: 1000,
      unitOfMeasure: 'GRAMS' as const,
      status: 'scheduled',
      requestedBy: 'user-1',
      createdAt: new Date('2024-12-01T10:00:00Z'),
      updatedAt: new Date('2024-12-01T10:00:00Z'),
      archivedAt: null,
    };

    mockCreateProductionPlan.mockResolvedValue(plan);
    mockCreateAvailabilityRecord.mockResolvedValue({
      id: 'availability-1',
      ...availability,
      planId: plan.id,
      planCode: plan.code,
      recipeId: plan.recipeId,
      recipeName: plan.recipeName,
      scheduledFor: plan.scheduledFor,
      quantityInUnits: plan.quantityInUnits,
      unitOfMeasure: plan.unitOfMeasure,
      status: 'insufficient',
      confirmedBy: 'user-supervisor',
      confirmedAt: new Date('2024-12-31T23:00:00Z'),
      notes: null,
      totalRequiredInGrams: availability.totalRequiredInGrams,
      totalAvailableInGrams: availability.totalAvailableInGrams,
      totalShortageInGrams: availability.totalShortageInGrams,
      createdAt: new Date('2024-12-31T23:00:00Z'),
      updatedAt: new Date('2024-12-31T23:00:00Z'),
      archivedAt: null,
    });

    const result = await scheduleProductionPlan({
      input: {
        recipeId: plan.recipeId,
        recipeName: plan.recipeName,
        scheduledFor: plan.scheduledFor,
        quantityInUnits: plan.quantityInUnits,
        unitOfMeasure: plan.unitOfMeasure,
        requestedBy: 'user-operator',
      },
      availability,
      confirmedBy: 'user-supervisor',
    });

    expect(mockCreateProductionPlan).toHaveBeenCalled();
    expect(mockCreateAvailabilityRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: plan.id,
        status: 'insufficient',
        confirmedBy: 'user-supervisor',
        totalShortageInGrams: 600,
        estimatedCostInBRL: availability.totalEstimatedCostInBRL,
      }),
    );
    expect(result.plan).toEqual(plan);
    expect(result.availabilityRecord).toBeTruthy();
  });

  it('does not create availability record when there is no shortage', async () => {
    const availability: PlanAvailabilityResult = {
      status: 'sufficient',
      items: [],
      shortages: [],
      totalRequiredInGrams: 0,
      totalAvailableInGrams: 0,
      totalShortageInGrams: 0,
      totalEstimatedCostInBRL: 0,
    };

    mockCreateProductionPlan.mockResolvedValue({
      id: 'plan-2',
      recipeId: 'recipe-base',
      recipeName: 'Base neutra',
      sequenceNumber: 2,
      code: 'PLN-002',
      scheduledFor: new Date('2025-01-05T10:00:00Z'),
      quantityInUnits: 500,
      unitOfMeasure: 'GRAMS' as const,
      status: 'scheduled',
      requestedBy: 'user-2',
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    const result = await scheduleProductionPlan({
      input: {
        recipeId: 'recipe-base',
        recipeName: 'Base neutra',
        scheduledFor: new Date('2025-01-05T10:00:00Z'),
        quantityInUnits: 500,
        unitOfMeasure: 'GRAMS' as const,
        requestedBy: 'user-2',
      },
      availability,
    });

    expect(mockCreateAvailabilityRecord).not.toHaveBeenCalled();
    expect(result.availabilityRecord).toBeNull();
  });
});
