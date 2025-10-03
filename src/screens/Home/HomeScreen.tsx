import { StyleSheet, Text } from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';

export function HomeScreen() {
  return (
    <ScreenContainer>
      <Text style={styles.heading}>Gelateria Dashboard</Text>
      <Text style={styles.subtitle}>
        Comece configurando produtos, receitas e estoque.
      </Text>
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
  },
});

export default HomeScreen;
