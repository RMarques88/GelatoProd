import { Pressable, StyleSheet, Text } from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { useAuth } from '@/hooks/useAuth';

export function HomeScreen() {
  const { signOut, isLoading } = useAuth();

  return (
    <ScreenContainer>
      <Text style={styles.heading}>Gelateria Dashboard</Text>
      <Text style={styles.subtitle}>
        Comece configurando produtos, receitas e estoque.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={signOut}
        disabled={isLoading}
      >
        <Text style={styles.buttonText}>Sair</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1A1B1E',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#5E5F61',
    marginBottom: 32,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#E53E3E',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default HomeScreen;
