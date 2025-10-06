import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { ReportingAnalyticsPanel } from '@/components/stock/ReportingAnalyticsPanel';
import type {
  DivergenceUsagePeriodSummary,
  IngredientConsumptionPeriodSummary,
  RecipeProductionPeriodSummary,
} from '@/services/reportingMetrics';

describe('ReportingAnalyticsPanel', () => {
  const recipeSummaries: RecipeProductionPeriodSummary[] = [
    {
      periodKey: 'production_semana_40',
      periodLabel: 'Semana 40 (01 out – 07 out)',
      periodStart: new Date('2025-10-01T00:00:00.000Z'),
      periodEnd: new Date('2025-10-07T23:59:59.000Z'),
      totals: {
        totalPlans: 3,
        totalPlannedQuantityInUnits: 260,
        totalActualQuantityInUnits: 248,
        totalEstimatedCostInBRL: 1310,
        totalActualCostInBRL: 1280,
        recipes: [
          {
            recipeId: 'recipe-vanilla',
            recipeName: 'Sorvete de Baunilha',
            planCount: 2,
            plannedQuantityInUnits: 180,
            actualQuantityInUnits: 170,
            estimatedCostInBRL: 890,
            actualCostInBRL: 870,
          },
          {
            recipeId: 'recipe-pistachio',
            recipeName: 'Gelato de Pistache',
            planCount: 1,
            plannedQuantityInUnits: 80,
            actualQuantityInUnits: 78,
            estimatedCostInBRL: 420,
            actualCostInBRL: 410,
          },
        ],
      },
    },
  ];

  const ingredientSummaries: IngredientConsumptionPeriodSummary[] = [
    {
      periodKey: 'consumption_semana_40',
      periodLabel: 'Semana 40 (01 out – 07 out)',
      periodStart: new Date('2025-10-01T00:00:00.000Z'),
      periodEnd: new Date('2025-10-07T23:59:59.000Z'),
      totals: {
        totalMovements: 4,
        totalConsumedInGrams: 3200,
        products: [
          {
            productId: 'prod-milk',
            quantityInGrams: 1800,
            movementCount: 2,
          },
          {
            productId: 'prod-sugar',
            quantityInGrams: 900,
            movementCount: 1,
          },
          {
            productId: 'prod-cream',
            quantityInGrams: 500,
            movementCount: 1,
          },
        ],
      },
    },
  ];

  const divergenceSummaries: DivergenceUsagePeriodSummary[] = [
    {
      periodKey: 'divergence_semana_40',
      periodLabel: 'Semana 40 (01 out – 07 out)',
      periodStart: new Date('2025-10-01T00:00:00.000Z'),
      periodEnd: new Date('2025-10-07T23:59:59.000Z'),
      totals: {
        totalDivergences: 2,
        totalShortageInUnits: 35,
        severity: [
          {
            severity: 'high',
            count: 1,
            totalShortageInUnits: 25,
          },
          {
            severity: 'medium',
            count: 1,
            totalShortageInUnits: 10,
          },
        ],
      },
    },
  ];

  const productNames = new Map([
    ['prod-milk', 'Leite integral'],
    ['prod-sugar', 'Açúcar refinado'],
    ['prod-cream', 'Creme de leite'],
  ]);

  it('renders analytics data snapshot', () => {
    let testRenderer: renderer.ReactTestRenderer;

    act(() => {
      testRenderer = renderer.create(
        React.createElement(ReportingAnalyticsPanel, {
          granularity: 'week',
          rangeLabel: '01 out – 07 out',
          isLoading: false,
          error: null,
          recipeSummaries,
          ingredientSummaries,
          divergenceSummaries,
          onRetry: jest.fn(),
          getProductName: productId =>
            productNames.get(productId) ?? 'Produto desconhecido',
        }),
      );
    });

    expect(testRenderer!.toJSON()).toMatchSnapshot();
    act(() => {
      testRenderer!.unmount();
    });
  });

  it('renders error state snapshot', () => {
    let testRenderer: renderer.ReactTestRenderer;

    act(() => {
      testRenderer = renderer.create(
        React.createElement(ReportingAnalyticsPanel, {
          granularity: 'week',
          rangeLabel: '01 out – 07 out',
          isLoading: false,
          error: new Error('Firestore indisponível'),
          recipeSummaries: [],
          ingredientSummaries: [],
          divergenceSummaries: [],
          onRetry: jest.fn(),
          getProductName: () => 'Produto desconhecido',
        }),
      );
    });

    expect(testRenderer!.toJSON()).toMatchSnapshot();
    act(() => {
      testRenderer!.unmount();
    });
  });
});
