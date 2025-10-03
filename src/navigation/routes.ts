import type { ComponentType } from 'react';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import type { UserRole } from '@/domain';
import HomeScreen from '@/screens/Home/HomeScreen';
import ProductsListScreen from '@/screens/Products/ProductsListScreen';
import ProductFormScreen from '@/screens/Products/ProductFormScreen';
import RecipesListScreen from '@/screens/Recipes/RecipesListScreen';
import RecipeFormScreen from '@/screens/Recipes/RecipeFormScreen';

export type AppStackParamList = {
  Home: undefined;
  Products: undefined;
  ProductUpsert: { productId?: string } | undefined;
  Recipes: undefined;
  RecipeUpsert: { recipeId?: string } | undefined;
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
];
