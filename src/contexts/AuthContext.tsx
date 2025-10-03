import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { FirebaseError } from 'firebase/app';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';

import { getFirebaseAuth } from '@/services/firebase';
import { logDebug, logError } from '@/utils/logger';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'gelatie' | 'manager' | 'admin';
};

export type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(
      auth,
      firebaseUser => {
        setUser(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
        setIsLoading(false);
      },
      error => {
        logError(error, 'Auth.onAuthStateChanged');
        setUser(null);
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      signIn: async (email, password) => {
        setIsLoading(true);
        try {
          logDebug('Auth.signIn', { email, passwordExists: Boolean(password) });
          const auth = getFirebaseAuth();
          await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (error) {
          logError(error, 'Auth.signIn');
          throw normalizeAuthError(error);
        } finally {
          setIsLoading(false);
        }
      },
      signOut: async () => {
        setIsLoading(true);
        try {
          logDebug('Auth.signOut');
          const auth = getFirebaseAuth();
          await firebaseSignOut(auth);
        } catch (error) {
          logError(error, 'Auth.signOut');
          throw normalizeAuthError(error);
        } finally {
          setIsLoading(false);
        }
      },
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function mapFirebaseUser(firebaseUser: User): AuthUser {
  return {
    id: firebaseUser.uid,
    name: firebaseUser.displayName ?? firebaseUser.email ?? 'Gelatiê',
    email: firebaseUser.email ?? '',
    role: 'manager', // TODO: map roles from custom claims / Firestore profile
  };
}

function normalizeAuthError(error: unknown): Error {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return new Error('E-mail ou senha inválidos.');
      case 'auth/too-many-requests':
        return new Error('Muitas tentativas. Tente novamente em instantes.');
      case 'auth/network-request-failed':
        return new Error('Falha de rede. Verifique sua conexão.');
      default:
        return new Error('Não foi possível completar a operação de autenticação.');
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Erro inesperado na autenticação.');
}

export function useAuthContext() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }

  return context;
}
