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
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';

import { UserProfile, UserRole } from '@/domain';
import { getFirebaseAuth } from '@/services/firebase';
import { ensureUserProfile } from '@/services/firestore';
import { logDebug, logError } from '@/utils/logger';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phoneNumber?: string | null;
};

export type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isHydrating: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    let isActive = true;

    const unsubscribe = onAuthStateChanged(
      auth,
      firebaseUser => {
        if (!firebaseUser) {
          if (isActive) {
            setUser(null);
            setIsLoading(false);
            setIsHydrating(false);
          }
          return;
        }

        setIsLoading(true);

        ensureAuthenticatedUser(firebaseUser)
          .then(profile => {
            if (!isActive) {
              return;
            }

            setUser(mapFirebaseUser(firebaseUser, profile));
          })
          .catch(error => {
            logError(error, 'Auth.ensureAuthenticatedUser');

            if (!isActive) {
              return;
            }

            setUser(mapFirebaseUser(firebaseUser));
          })
          .finally(() => {
            if (isActive) {
              setIsLoading(false);
              setIsHydrating(false);
            }
          });
      },
      error => {
        logError(error, 'Auth.onAuthStateChanged');
        setUser(null);
        setIsLoading(false);
        setIsHydrating(false);
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isHydrating,
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
      resetPassword: async email => {
        setIsLoading(true);
        try {
          logDebug('Auth.resetPassword', { email });
          const auth = getFirebaseAuth();
          await sendPasswordResetEmail(auth, email.trim());
        } catch (error) {
          logError(error, 'Auth.resetPassword');
          throw normalizeAuthError(error);
        } finally {
          setIsLoading(false);
        }
      },
    }),
    [user, isLoading, isHydrating],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const DEFAULT_ROLE: UserRole = 'gelatie';
const DEFAULT_DISPLAY_NAME = 'Gelatiê';

async function ensureAuthenticatedUser(firebaseUser: User): Promise<UserProfile> {
  const profile = await ensureUserProfile(firebaseUser.uid, {
    email: firebaseUser.email ?? '',
    displayName: firebaseUser.displayName ?? firebaseUser.email ?? DEFAULT_DISPLAY_NAME,
    phoneNumber: firebaseUser.phoneNumber ?? null,
    role: DEFAULT_ROLE,
  });

  return profile;
}

function mapFirebaseUser(firebaseUser: User, profile?: Partial<UserProfile>) {
  return {
    id: firebaseUser.uid,
    name:
      profile?.displayName ??
      firebaseUser.displayName ??
      firebaseUser.email ??
      DEFAULT_DISPLAY_NAME,
    email: profile?.email ?? firebaseUser.email ?? '',
    role: profile?.role ?? DEFAULT_ROLE,
    phoneNumber: profile?.phoneNumber ?? firebaseUser.phoneNumber ?? null,
  } satisfies AuthUser;
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
