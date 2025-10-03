import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { useAuth } from '@/hooks/useAuth';
import type { AuthStackParamList } from '@/navigation';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function LoginScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList, 'Login'>>();
  const { signIn, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Informe e-mail e senha.');
      return;
    }

    try {
      setError(null);
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar. Tente novamente.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScreenContainer>
        <View style={styles.content}>
          <Text style={styles.title}>Entrar</Text>
          <Text style={styles.subtitle}>
            Use suas credenciais para acessar o painel da gelateria.
          </Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={styles.input}
              placeholder="seu@email.com"
              returnKeyType="next"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Senha</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              style={styles.input}
              placeholder="••••••••"
              returnKeyType="done"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleSubmit}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('ForgotPassword', { email })}
            style={({ pressed }) => [
              styles.linkButton,
              pressed && styles.linkButtonPressed,
            ]}
            disabled={isLoading}
          >
            <Text style={styles.linkText}>Esqueci minha senha</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1B1E',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#5E5F61',
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1B1E',
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D4D5D8',
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  error: {
    color: '#E53E3E',
    marginBottom: 16,
  },
  button: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#4E9F3D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignSelf: 'center',
  },
  linkButtonPressed: {
    opacity: 0.7,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4E9F3D',
  },
});
