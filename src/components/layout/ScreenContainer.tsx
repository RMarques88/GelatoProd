import { PropsWithChildren, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AppStackParamList } from '@/navigation';
import type { NavigationProp } from '@react-navigation/native';

type ScreenContainerProps = PropsWithChildren<{
  showHomeButton?: boolean;
}>;

/**
 * Wrapper component that applies safe default padding and background color.
 * Extend this component as we refine the design system.
 */
export function ScreenContainer({
  children,
  showHomeButton = true,
}: ScreenContainerProps) {
  const navigation = useNavigation<NavigationProp<AppStackParamList>>();

  const handleGoHome = useCallback(() => {
    navigation.navigate('Home');
  }, [navigation]);

  return (
    <View style={styles.container}>
      {showHomeButton ? (
        <Pressable
          onPress={handleGoHome}
          style={({ pressed }) => [
            styles.homeButton,
            pressed && styles.homeButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Voltar para a tela inicial"
        >
          <Ionicons name="home-outline" size={20} color="#1F2937" />
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F8',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  homeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    alignSelf: 'flex-start',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  homeButtonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.85,
  },
});
