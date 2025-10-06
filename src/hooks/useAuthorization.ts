import { useMemo } from 'react';

import { useAuth } from './useAuth';

import type { AuthUser } from '@/contexts/AuthContext';
import type { UserRole } from '@/domain';

export type AuthorizationState = {
  role: UserRole | null;
  hasRole: (role: UserRole) => boolean;
  isAdmin: boolean;
  canViewStock: boolean;
  canManageStock: boolean;
  canAdjustStock: boolean;
  canViewStockAlerts: boolean;
  canAcknowledgeStockAlerts: boolean;
  canViewReports: boolean;
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
    const isGelatie = currentRole === 'gelatie';
    const isEstoquista = currentRole === 'estoquista';
    const isProdutor = currentRole === 'produtor';

    const hasRole = (requiredRole: UserRole) => {
      if (!currentRole) {
        return false;
      }

      if (isGelatie) {
        return true;
      }

      return currentRole === requiredRole;
    };

    const isAdmin = isGelatie;
    const canViewStock = isGelatie || isEstoquista;
    const canManageStock = isGelatie || isEstoquista;
    const canAdjustStock = isGelatie || isEstoquista;
    const canViewStockAlerts = isGelatie || isEstoquista;
    const canAcknowledgeStockAlerts = isGelatie || isEstoquista;
    const canViewReports = isGelatie || isEstoquista;
    const canManageProducts = isGelatie;
    const canScheduleProduction = isGelatie;
    const canAdvanceProduction = isGelatie || isProdutor;
    const canCancelProduction = isGelatie;
    const canManageNotifications = isGelatie;
    const canMarkNotificationRead = Boolean(user);
    const canAcknowledgeAlerts = isGelatie || isEstoquista;
    const canResolveAlerts = isGelatie || isEstoquista;

    return {
      role: currentRole,
      hasRole,
      isAdmin,
      canViewStock,
      canManageStock,
      canAdjustStock,
      canViewStockAlerts,
      canAcknowledgeStockAlerts,
      canViewReports,
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
