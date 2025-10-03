import { useMemo } from 'react';

import { UserRole } from '@/domain';
import { AuthUser } from '@/contexts/AuthContext';
import { useAuth } from './useAuth';

const ROLE_PRIORITY: Record<UserRole, number> = {
  gelatie: 0,
  manager: 1,
  admin: 2,
};

function rolePriority(role: UserRole | null | undefined) {
  if (!role) {
    return -1;
  }

  return ROLE_PRIORITY[role] ?? -1;
}

export type AuthorizationState = {
  role: UserRole | null;
  hasRole: (role: UserRole) => boolean;
  isAdmin: boolean;
  canManageProducts: boolean;
  canScheduleProduction: boolean;
  canAdvanceProduction: boolean;
  canCancelProduction: boolean;
  canManageNotifications: boolean;
  canMarkNotificationRead: boolean;
  canAcknowledgeAlerts: boolean;
  canResolveAlerts: boolean;
};

export function useAuthorization(overrideUser?: AuthUser | null): AuthorizationState {
  const auth = useAuth();
  const user = overrideUser ?? auth.user;

  const authorization = useMemo<AuthorizationState>(() => {
    const currentRole = user?.role ?? null;

    const hasRole = (requiredRole: UserRole) =>
      rolePriority(currentRole) >= rolePriority(requiredRole);

    const isAdmin = hasRole('admin');
    const canManageProducts = hasRole('manager');
    const canScheduleProduction = hasRole('manager');
    const canAdvanceProduction = hasRole('manager');
    const canCancelProduction = hasRole('manager');
    const canManageNotifications = hasRole('manager');
    const canMarkNotificationRead = Boolean(user);
    const canAcknowledgeAlerts = Boolean(user);
    const canResolveAlerts = hasRole('manager');

    return {
      role: currentRole,
      hasRole,
      isAdmin,
      canManageProducts,
      canScheduleProduction,
      canAdvanceProduction,
      canCancelProduction,
      canManageNotifications,
      canMarkNotificationRead,
      canAcknowledgeAlerts,
      canResolveAlerts,
    };
  }, [user]);

  return authorization;
}
