import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { RoleGate } from '@/components/security/RoleGate';
import type { AppStackParamList } from './routes';
import { appRoutes } from './routes';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {appRoutes.map(route => {
          const ScreenComponent = route.component;

          return (
            <Stack.Screen
              key={route.name}
              name={route.name}
              options={route.options}
            >
              {screenProps => (
                <RoleGate
                  requiredRole={route.requiredRole}
                  description={route.description}
                >
                  <ScreenComponent {...screenProps} />
                </RoleGate>
              )}
            </Stack.Screen>
          );
        })}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default AppNavigator;
