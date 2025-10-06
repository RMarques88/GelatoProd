import type { ComponentType } from 'react';

import HomeScreen from '@/screens/Home/HomeScreen';
import NotificationCenterScreen from '@/screens/Notifications/NotificationCenterScreen';
import ProductionExecutionScreen from '@/screens/Production/ProductionExecutionScreen';
import ProductionIngredientSummaryScreen from '@/screens/Production/ProductionIngredientSummaryScreen';
import ProductionPlannerScreen from '@/screens/Production/ProductionPlannerScreen';
import ProductFormScreen from '@/screens/Products/ProductFormScreen';
import ProductsListScreen from '@/screens/Products/ProductsListScreen';
import RecipeFormScreen from '@/screens/Recipes/RecipeFormScreen';
import RecipesListScreen from '@/screens/Recipes/RecipesListScreen';
import StockReportScreen from '@/screens/Reports/StockReportScreen';
import StockAlertsScreen from '@/screens/Stock/StockAlertsScreen';
import StockItemScreen from '@/screens/Stock/StockItemScreen';
import StockListScreen from '@/screens/Stock/StockListScreen';

import type { UserRole } from '@/domain';
import type { PeriodGranularity } from '@/services/reportingMetrics';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

export type AppStackParamList = {
  Home: undefined;
  Products: undefined;
  ProductUpsert: { productId?: string } | undefined;
  Recipes: undefined;
  RecipeUpsert: { recipeId?: string } | undefined;
  Stock: undefined;
  StockItem: { stockItemId: string };
  StockAlerts: undefined;
  StockReports:
    | undefined
    | {
        granularity?: PeriodGranularity;
        rangeInDays?: number;
        from?: string;
        to?: string;
      };
  ProductionPlanner: undefined;
  ProductionExecution: { planId: string };
  ProductionIngredientSummary: { planId: string };
  NotificationCenter: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: { email?: string } | undefined;
};

export type AppRouteConfig<Name extends keyof AppStackParamList> = {
  name: Name;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  requiredRole: UserRole;
  allowedRoles?: UserRole[];
  options?: NativeStackNavigationOptions;
  description?: string;
};

export const appRoutes: AppRouteConfig<keyof AppStackParamList>[] = [
  {
    name: 'Home',
    component: HomeScreen,
    requiredRole: 'produtor',
    allowedRoles: ['gelatie', 'estoquista', 'produtor'],
    options: {
      headerShown: false,
    },
    description: 'Painel principal da gelateria.',
  },
  {
    name: 'Products',
    component: ProductsListScreen,
    requiredRole: 'gelatie',
    allowedRoles: ['gelatie'],
    options: {
      headerShown: false,
    },
    description: 'Catálogo completo de produtos da gelateria.',
  },
  {
    name: 'ProductUpsert',
    component: ProductFormScreen,
    requiredRole: 'gelatie',
    allowedRoles: ['gelatie'],
    options: {
      headerShown: false,
    },
    description: 'Cadastro e edição de produtos.',
  },
  {
    name: 'Recipes',
    component: RecipesListScreen,
    requiredRole: 'produtor',
    allowedRoles: ['gelatie', 'produtor'],
    options: {
      headerShown: false,
    },
    description: 'Lista de receitas e bases de preparo.',
  },
  {
    name: 'RecipeUpsert',
    component: RecipeFormScreen,
    requiredRole: 'gelatie',
    allowedRoles: ['gelatie'],
    options: {
      headerShown: false,
    },
    description: 'Cadastro e edição de receitas.',
  },
  {
    name: 'Stock',
    component: StockListScreen,
    requiredRole: 'estoquista',
    allowedRoles: ['gelatie', 'estoquista'],
    options: {
      headerShown: false,
    },
    description: 'Níveis de estoque e ajustes manuais.',
  },
  {
    name: 'StockItem',
    component: StockItemScreen,
    requiredRole: 'estoquista',
    allowedRoles: ['gelatie', 'estoquista'],
    options: {
      headerShown: false,
    },
    description: 'Detalhes e histórico de movimentações do estoque.',
  },
  {
    name: 'StockAlerts',
    component: StockAlertsScreen,
    requiredRole: 'estoquista',
    allowedRoles: ['gelatie', 'estoquista'],
    options: {
      headerShown: false,
    },
    description: 'Alertas críticos de estoque.',
  },
  {
    name: 'StockReports',
    component: StockReportScreen,
    requiredRole: 'estoquista',
    allowedRoles: ['gelatie', 'estoquista'],
    options: {
      headerShown: false,
    },
    description: 'Relatórios de entradas, saídas e divergências do estoque.',
  },
  {
    name: 'ProductionPlanner',
    component: ProductionPlannerScreen,
    requiredRole: 'gelatie',
    allowedRoles: ['gelatie'],
    options: {
      headerShown: false,
    },
    description: 'Planejamento de produção com calendário e lista.',
  },
  {
    name: 'ProductionExecution',
    component: ProductionExecutionScreen,
    requiredRole: 'produtor',
    allowedRoles: ['gelatie', 'produtor'],
    options: {
      headerShown: false,
    },
    description: 'Execução e acompanhamento das etapas de produção.',
  },
  {
    name: 'ProductionIngredientSummary',
    component: ProductionIngredientSummaryScreen,
    requiredRole: 'produtor',
    allowedRoles: ['gelatie', 'produtor'],
    options: {
      headerShown: false,
    },
    description: 'Resumo de ingredientes e custos estimados para um plano de produção.',
  },
  {
    name: 'NotificationCenter',
    component: NotificationCenterScreen,
    requiredRole: 'produtor',
    allowedRoles: ['gelatie', 'estoquista', 'produtor'],
    options: {
      headerShown: false,
    },
    description: 'Central completa de notificações operacionais.',
  },
];
