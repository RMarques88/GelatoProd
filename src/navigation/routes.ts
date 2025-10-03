import type { ComponentType } from 'react';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import type { UserRole } from '@/domain';
import HomeScreen from '@/screens/Home/HomeScreen';
import ProductsListScreen from '@/screens/Products/ProductsListScreen';
import ProductFormScreen from '@/screens/Products/ProductFormScreen';
import RecipesListScreen from '@/screens/Recipes/RecipesListScreen';
import RecipeFormScreen from '@/screens/Recipes/RecipeFormScreen';
import StockListScreen from '@/screens/Stock/StockListScreen';
import StockItemScreen from '@/screens/Stock/StockItemScreen';
import StockAlertsScreen from '@/screens/Stock/StockAlertsScreen';
import ProductionPlannerScreen from '@/screens/Production/ProductionPlannerScreen';
import ProductionExecutionScreen from '@/screens/Production/ProductionExecutionScreen';
import NotificationCenterScreen from '@/screens/Notifications/NotificationCenterScreen';

export type AppStackParamList = {
  Home: undefined;
  Products: undefined;
  ProductUpsert: { productId?: string } | undefined;
  Recipes: undefined;
  RecipeUpsert: { recipeId?: string } | undefined;
  Stock: undefined;
  StockItem: { stockItemId: string };
  StockAlerts: undefined;
  ProductionPlanner: undefined;
  ProductionExecution: { planId: string };
  NotificationCenter: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: { email?: string } | undefined;
};

export type AppRouteConfig<Name extends keyof AppStackParamList> = {
  name: Name;
  component: ComponentType<any>;
  requiredRole: UserRole;
  options?: NativeStackNavigationOptions;
  description?: string;
};

export const appRoutes: AppRouteConfig<keyof AppStackParamList>[] = [
  {
    name: 'Home',
    component: HomeScreen,
    requiredRole: 'gelatie',
    options: {
      headerShown: false,
    },
    description: 'Painel principal da gelateria.',
  },
  {
    name: 'Products',
    component: ProductsListScreen,
    requiredRole: 'gelatie',
    options: {
      headerShown: false,
    },
    description: 'Catálogo completo de produtos da gelateria.',
  },
  {
    name: 'ProductUpsert',
    component: ProductFormScreen,
    requiredRole: 'manager',
    options: {
      headerShown: false,
    },
    description: 'Cadastro e edição de produtos.',
  },
  {
    name: 'Recipes',
    component: RecipesListScreen,
    requiredRole: 'gelatie',
    options: {
      headerShown: false,
    },
    description: 'Lista de receitas e bases de preparo.',
  },
  {
    name: 'RecipeUpsert',
    component: RecipeFormScreen,
    requiredRole: 'manager',
    options: {
      headerShown: false,
    },
    description: 'Cadastro e edição de receitas.',
  },
  {
    name: 'Stock',
    component: StockListScreen,
    requiredRole: 'gelatie',
    options: {
      headerShown: false,
    },
    description: 'Níveis de estoque e ajustes manuais.',
  },
  {
    name: 'StockItem',
    component: StockItemScreen,
    requiredRole: 'gelatie',
    options: {
      headerShown: false,
    },
    description: 'Detalhes e histórico de movimentações do estoque.',
  },
  {
    name: 'StockAlerts',
    component: StockAlertsScreen,
    requiredRole: 'gelatie',
    options: {
      headerShown: false,
    },
    description: 'Alertas críticos de estoque.',
  },
  {
    name: 'ProductionPlanner',
    component: ProductionPlannerScreen,
    requiredRole: 'manager',
    options: {
      headerShown: false,
    },
    description: 'Planejamento de produção com calendário e lista.',
  },
  {
    name: 'ProductionExecution',
    component: ProductionExecutionScreen,
    requiredRole: 'gelatie',
    options: {
      headerShown: false,
    },
    description: 'Execução e acompanhamento das etapas de produção.',
  },
  {
    name: 'NotificationCenter',
    component: NotificationCenterScreen,
    requiredRole: 'gelatie',
    options: {
      headerShown: false,
    },
    description: 'Central completa de notificações operacionais.',
  },
];
