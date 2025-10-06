import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { RoleGate } from '@/components/security/RoleGate';
import { useAuth } from '@/hooks/useAuth';
import { LoginScreen, ForgotPasswordScreen } from '@/screens/Auth';
import { appRoutes } from './routes';
import type { AppStackParamList, AuthStackParamList } from './routes';

const ProtectedStack = createNativeStackNavigator<AppStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

export function AppNavigator() {
  const { user, isHydrating } = useAuth();

  console.log('[navigator] AppNavigator render', { hasUser: !!user, isHydrating });

  if (isHydrating) {
    console.log('[navigator] Showing loader');
    return <FullScreenLoader />;
  }

  console.log('[navigator] Rendering', user ? 'ProtectedScreens' : 'AuthScreens');
  return (
    <NavigationContainer>
      {user ? <ProtectedScreens /> : <AuthScreens />}
    </NavigationContainer>
  );
}

function ProtectedScreens() {
  console.log('[navigator] ProtectedScreens render', { routeCount: appRoutes.length });
  return (
    <ProtectedStack.Navigator screenOptions={{ headerShown: false }}>
      {appRoutes.map(route => {
        console.log('[navigator] Registering route:', route.name);
        const ScreenComponent = route.component;

        return (
          <ProtectedStack.Screen
            key={route.name}
            name={route.name}
            options={route.options}
          >
            {screenProps => {
              console.log('[navigator] Rendering screen:', route.name);
              return (
                <RoleGate
                  requiredRole={route.requiredRole}
                  allowedRoles={route.allowedRoles}
                  description={route.description}
                >
                  <ScreenComponent {...screenProps} />
                </RoleGate>
              );
            }}
          </ProtectedStack.Screen>
        );
      })}
    </ProtectedStack.Navigator>
  );
}

function AuthScreens() {
  return (
    <AuthStack.Navigator
      screenOptions={{ headerShown: false, presentation: 'card' }}
      initialRouteName="Login"
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function FullScreenLoader() {
  return (
    <View style={styles.loaderContainer}>
      <ActivityIndicator size="large" color="#4E9F3D" />
    </View>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F8',
  },
});

export default AppNavigator;
