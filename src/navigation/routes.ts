import type { ComponentType } from 'react';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import type { UserRole } from '@/domain';
import HomeScreen from '@/screens/Home/HomeScreen';

export type AppStackParamList = {
  Home: undefined;
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
];
