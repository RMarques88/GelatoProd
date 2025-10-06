import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/domain';

export type RoleGateProps = {
  requiredRole: UserRole;
  children: ReactNode;
  fallback?: ReactNode;
  description?: string;
  allowedRoles?: UserRole[];
};

export function RoleGate({
  requiredRole,
  children,
  fallback,
  description,
  allowedRoles,
}: RoleGateProps) {
  const { user, isLoading } = useAuth();
  const currentRole = user?.role ?? null;
  const defaultRoles = useMemo(
    () => Array.from(new Set([requiredRole, 'gelatie'])),
    [requiredRole],
  );
  const allowedRolesResolved = allowedRoles?.length
    ? Array.from(new Set([...allowedRoles, 'gelatie']))
    : defaultRoles;
  const hasAccess = Boolean(currentRole && allowedRolesResolved.includes(currentRole));

  console.log('[RoleGate]', {
    requiredRole,
    userRole: user?.role,
    isLoading,
    allowedRoles: allowedRolesResolved,
    hasAccess,
  });

  if (isLoading) {
    console.log('[RoleGate] Showing loader');
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#4E9F3D" />
      </View>
    );
  }

  if (!hasAccess) {
    console.log('[RoleGate] Access denied');
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <View style={styles.unauthorizedContainer}>
        <Text style={styles.unauthorizedTitle}>Acesso restrito</Text>
        <Text style={styles.unauthorizedMessage}>
          {description ??
            'Você não possui as permissões necessárias para acessar este conteúdo.'}
        </Text>
      </View>
    );
  }

  console.log('[RoleGate] Access granted, rendering children');
  return <>{children}</>;
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F8',
  },
  unauthorizedContainer: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F8',
    gap: 12,
  },
  unauthorizedTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  unauthorizedMessage: {
    fontSize: 15,
    textAlign: 'center',
    color: '#4B5563',
  },
});
