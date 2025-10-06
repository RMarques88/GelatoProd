import { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { useProductionPlans, useProductionStages } from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { formatRelativeDate } from '@/utils/date';

import type { ProductionPlan, ProductionStage } from '@/domain';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const DAYS_TO_SHOW = 14;

type ViewMode = 'calendar' | 'list';

type PlanCardProps = {
  plan: ProductionPlan;
  stages: ProductionStage[];
  onOpenExecution: (planId: string) => void;
  onOpenIngredientSummary: (planId: string) => void;
};

function PlanCard({
  plan,
  stages,
  onOpenExecution,
  onOpenIngredientSummary,
}: PlanCardProps) {
  const totalStages = stages.length;
  const completedStages = stages.filter(stage => stage.status === 'completed').length;
  const inProgressStages = stages.filter(stage => stage.status === 'in_progress').length;

  const progressLabel =
    totalStages === 0
      ? 'Sem etapas'
      : `${completedStages}/${totalStages} etapas concluídas${inProgressStages > 0 ? ` • ${inProgressStages} em andamento` : ''}`;

  const statusStyles = getStatusStyles(plan.status);

  return (
    <Pressable
      onPress={() => onOpenExecution(plan.id)}
      style={({ pressed }) => [styles.planCard, pressed && styles.planCardPressed]}
    >
      <View style={styles.planHeader}>
        <View>
          <Text style={styles.planCode}>#{plan.code}</Text>
          <Text style={styles.planTitle}>{plan.recipeName}</Text>
          <Text style={styles.planMeta}>
            {plan.quantityInUnits} {plan.unitOfMeasure === 'GRAMS' ? 'g' : 'un'} ·{' '}
            {plan.scheduledFor.toLocaleDateString('pt-BR')}
          </Text>
        </View>
        <View style={[styles.statusBadge, statusStyles.container]}>
          <Text style={[styles.statusBadgeText, statusStyles.text]}>
            {labelForStatus(plan.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.planNotes}>
        {progressLabel} · Atualizado {formatRelativeDate(plan.updatedAt)}
      </Text>
      {plan.notes ? <Text style={styles.planDescription}>{plan.notes}</Text> : null}
      <View style={styles.planActionsRow}>
        <Pressable
          onPress={event => {
            event.stopPropagation();
            onOpenIngredientSummary(plan.id);
          }}
          style={({ pressed }) => [
            styles.planSecondaryButton,
            pressed && styles.planSecondaryButtonPressed,
          ]}
        >
          <Text style={styles.planSecondaryButtonText}>Ver ingredientes</Text>
        </Pressable>
        <Pressable
          onPress={event => {
            event.stopPropagation();
            onOpenExecution(plan.id);
          }}
          style={({ pressed }) => [
            styles.planActionButton,
            pressed && styles.planActionButtonPressed,
          ]}
        >
          <Text style={styles.planActionButtonText}>Abrir execução</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function labelForStatus(status: ProductionPlan['status']) {
  switch (status) {
    case 'draft':
      return 'Rascunho';
    case 'scheduled':
      return 'Agendado';
    case 'in_progress':
      return 'Em produção';
    case 'completed':
      return 'Concluído';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
}

function startOfDay(date: Date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function endOfDay(date: Date) {
  const clone = new Date(date);
  clone.setHours(23, 59, 59, 999);
  return clone;
}

export function ProductionPlannerScreen() {
  const { user } = useAuth();
  const authorization = useAuthorization(user);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));

  const {
    plans,
    isLoading: isLoadingPlans,
    error: plansError,
    retry: retryPlans,
  } = useProductionPlans({ includeArchived: false, limit: 100 });

  const {
    stages,
    isLoading: isLoadingStages,
    error: stagesError,
    retry: retryStages,
  } = useProductionStages({ limit: 200 });

  const groupedStages = useMemo(() => {
    return stages.reduce<Record<string, ProductionStage[]>>((accumulator, stage) => {
      const bucket = accumulator[stage.planId] ?? [];
      bucket.push(stage);
      accumulator[stage.planId] = bucket;
      return accumulator;
    }, {});
  }, [stages]);

  const days = useMemo(() => {
    const base = startOfDay(new Date());
    return Array.from({ length: DAYS_TO_SHOW }, (_, index) => {
      const day = new Date(base);
      day.setDate(base.getDate() + index);
      return day;
    });
  }, []);

  const plansForSelectedDate = useMemo(() => {
    if (viewMode !== 'calendar') {
      return plans;
    }

    return plans.filter(plan => {
      const schedule = plan.scheduledFor;
      return schedule >= selectedDate && schedule <= endOfDay(selectedDate);
    });
  }, [plans, selectedDate, viewMode]);

  const latePlans = useMemo(
    () =>
      plans.filter(
        plan =>
          plan.status !== 'completed' &&
          plan.status !== 'cancelled' &&
          plan.scheduledFor < startOfDay(new Date()),
      ),
    [plans],
  );

  const totalInProgress = useMemo(
    () => plans.filter(plan => plan.status === 'in_progress').length,
    [plans],
  );

  const totalScheduledForToday = useMemo(() => {
    const today = startOfDay(new Date());
    const end = endOfDay(today);
    return plans.filter(plan => plan.scheduledFor >= today && plan.scheduledFor <= end)
      .length;
  }, [plans]);

  const handleOpenExecution = useCallback(
    (planId: string) => {
      navigation.navigate('ProductionExecution', { planId });
    },
    [navigation],
  );

  const handleOpenIngredientSummary = useCallback(
    (planId: string) => {
      navigation.navigate('ProductionIngredientSummary', { planId });
    },
    [navigation],
  );

  const handleRetry = useCallback(() => {
    retryPlans();
    retryStages();
  }, [retryPlans, retryStages]);

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.heading}>Planejamento de produção</Text>
            <Text style={styles.subheading}>
              Visualize o calendário e acompanhe o andamento dos planos.
            </Text>
          </View>
          {plansError || stagesError ? (
            <Pressable
              onPress={handleRetry}
              style={({ pressed }) => [
                styles.retryChip,
                pressed && styles.retryChipPressed,
              ]}
            >
              <Text style={styles.retryChipText}>Tentar novamente</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Agendados para hoje</Text>
            <Text style={styles.summaryValue}>{totalScheduledForToday}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Em andamento</Text>
            <Text style={styles.summaryValue}>{totalInProgress}</Text>
          </View>
          <View
            style={[styles.summaryCard, latePlans.length > 0 && styles.summaryCardAlert]}
          >
            <Text style={styles.summaryLabel}>Atrasados</Text>
            <Text
              style={[
                styles.summaryValue,
                latePlans.length > 0 && styles.summaryValueAlert,
              ]}
            >
              {latePlans.length}
            </Text>
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setViewMode('calendar')}
            style={({ pressed }) => [
              styles.toggleButton,
              viewMode === 'calendar' && styles.toggleButtonActive,
              pressed && styles.toggleButtonPressed,
            ]}
          >
            <Text
              style={[
                styles.toggleButtonText,
                viewMode === 'calendar' && styles.toggleButtonTextActive,
              ]}
            >
              Calendário
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode('list')}
            style={({ pressed }) => [
              styles.toggleButton,
              viewMode === 'list' && styles.toggleButtonActive,
              pressed && styles.toggleButtonPressed,
            ]}
          >
            <Text
              style={[
                styles.toggleButtonText,
                viewMode === 'list' && styles.toggleButtonTextActive,
              ]}
            >
              Lista
            </Text>
          </Pressable>
        </View>

        {viewMode === 'calendar' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.calendarStrip}
          >
            {days.map(day => {
              const plansForDay = plans.filter(plan => {
                const schedule = plan.scheduledFor;
                return schedule >= startOfDay(day) && schedule <= endOfDay(day);
              });

              const isSelected = day.getTime() === selectedDate.getTime();

              return (
                <Pressable
                  key={day.toISOString()}
                  onPress={() => setSelectedDate(day)}
                  style={({ pressed }) => [
                    styles.dayCard,
                    isSelected && styles.dayCardActive,
                    pressed && styles.dayCardPressed,
                  ]}
                >
                  <Text style={[styles.dayLabel, isSelected && styles.dayLabelActive]}>
                    {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                  </Text>
                  <Text style={[styles.dayNumber, isSelected && styles.dayNumberActive]}>
                    {day.getDate()}
                  </Text>
                  <Text
                    style={[
                      styles.dayPlansCount,
                      isSelected && styles.dayPlansCountActive,
                    ]}
                  >
                    {plansForDay.length} planos
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {isLoadingPlans || isLoadingStages ? (
          <ActivityIndicator color="#4E9F3D" style={styles.loader} />
        ) : plansForSelectedDate.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Nada agendado por aqui</Text>
            <Text style={styles.emptySubtitle}>
              Use o calendário para trocar o dia ou cadastre novos planos.
            </Text>
            {authorization.canScheduleProduction ? (
              <Pressable
                onPress={() => navigation.navigate('Home')}
                style={({ pressed }) => [
                  styles.emptyActionButton,
                  pressed && styles.emptyActionButtonPressed,
                ]}
              >
                <Text style={styles.emptyActionButtonText}>Criar plano rápido</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.plansList}>
            {plansForSelectedDate.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                stages={groupedStages[plan.id] ?? []}
                onOpenExecution={handleOpenExecution}
                onOpenIngredientSummary={handleOpenIngredientSummary}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subheading: {
    fontSize: 15,
    color: '#4B5563',
    marginTop: 4,
  },
  retryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  retryChipPressed: {
    opacity: 0.8,
  },
  retryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryCardAlert: {
    borderWidth: 1,
    borderColor: '#F87171',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  summaryValueAlert: {
    color: '#B91C1C',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  toggleButtonActive: {
    borderColor: '#4E9F3D',
    backgroundColor: 'rgba(78, 159, 61, 0.12)',
  },
  toggleButtonPressed: {
    opacity: 0.85,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  toggleButtonTextActive: {
    color: '#2F855A',
  },
  calendarStrip: {
    marginBottom: 20,
  },
  dayCard: {
    width: 96,
    marginRight: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dayCardActive: {
    borderColor: '#4E9F3D',
    backgroundColor: 'rgba(78, 159, 61, 0.12)',
  },
  dayCardPressed: {
    opacity: 0.85,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  dayLabelActive: {
    color: '#2563EB',
  },
  dayNumber: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  dayNumberActive: {
    color: '#2563EB',
  },
  dayPlansCount: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
  },
  dayPlansCountActive: {
    color: '#1D4ED8',
  },
  loader: {
    marginTop: 40,
  },
  emptyContainer: {
    marginTop: 48,
    alignItems: 'center',
    gap: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyActionButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4E9F3D',
    backgroundColor: 'rgba(78, 159, 61, 0.08)',
  },
  emptyActionButtonPressed: {
    opacity: 0.85,
  },
  emptyActionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2F855A',
  },
  plansList: {
    gap: 16,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  planCardPressed: {
    opacity: 0.85,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  planCode: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  planTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  planMeta: {
    marginTop: 4,
    fontSize: 14,
    color: '#6B7280',
  },
  planNotes: {
    fontSize: 13,
    color: '#4B5563',
  },
  planDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  planActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  planSecondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  planSecondaryButtonPressed: {
    opacity: 0.85,
  },
  planSecondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4338CA',
  },
  planActionButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4E9F3D',
    backgroundColor: 'rgba(78, 159, 61, 0.1)',
  },
  planActionButtonPressed: {
    opacity: 0.85,
  },
  planActionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2F855A',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge_scheduled: {
    backgroundColor: '#DBEAFE',
  },
  statusBadgeText_scheduled: {
    color: '#1D4ED8',
  },
  statusBadge_in_progress: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeText_in_progress: {
    color: '#B45309',
  },
  statusBadge_completed: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeText_completed: {
    color: '#166534',
  },
  statusBadge_cancelled: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText_cancelled: {
    color: '#991B1B',
  },
  statusBadge_draft: {
    backgroundColor: '#E0E7FF',
  },
  statusBadgeText_draft: {
    color: '#4C1D95',
  },
});

function getStatusStyles(status: ProductionPlan['status']) {
  switch (status) {
    case 'draft':
      return {
        container: styles.statusBadge_draft,
        text: styles.statusBadgeText_draft,
      };
    case 'scheduled':
      return {
        container: styles.statusBadge_scheduled,
        text: styles.statusBadgeText_scheduled,
      };
    case 'in_progress':
      return {
        container: styles.statusBadge_in_progress,
        text: styles.statusBadgeText_in_progress,
      };
    case 'completed':
      return {
        container: styles.statusBadge_completed,
        text: styles.statusBadgeText_completed,
      };
    case 'cancelled':
    default:
      return {
        container: styles.statusBadge_cancelled,
        text: styles.statusBadgeText_cancelled,
      };
  }
}

export default ProductionPlannerScreen;
