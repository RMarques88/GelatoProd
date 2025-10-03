import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import {
  useProductionPlan,
  useProductionStages,
  useProductionDivergences,
} from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import type { AppStackParamList } from '@/navigation';
import {
  completeProductionPlanWithConsumption,
  startProductionPlanExecution,
} from '@/services/productionExecution';
import { formatRelativeDate } from '@/utils/date';
import type { ProductionPlan, ProductionStage } from '@/domain';

function StageCard({
  stage,
  onAdvance,
  isBusy,
}: {
  stage: ProductionStage;
  onAdvance: (stage: ProductionStage, nextStatus: 'in_progress' | 'completed') => Promise<void>;
  isBusy: boolean;
}) {
  const isCompleted = stage.status === 'completed';
  const isInProgress = stage.status === 'in_progress';
  const canStart = stage.status === 'pending' || stage.status === 'ready' || stage.status === 'paused';

  return (
    <View style={styles.stageCard}>
      <View style={styles.stageHeader}>
        <View style={styles.stageTitleWrapper}>
          <Text style={styles.stageTitle}>{stage.sequence}. {stage.name}</Text>
          <View style={[styles.stageBadge, styles[`stageBadge_${stage.status}` as const]]}>
            <Text style={[styles.stageBadgeText, styles[`stageBadgeText_${stage.status}` as const]]}>
              {stageStatusLabel(stage.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.stageMeta}>
          Atualizado {formatRelativeDate(stage.updatedAt)}
        </Text>
      </View>
      {stage.description ? <Text style={styles.stageDescription}>{stage.description}</Text> : null}
      <View style={styles.stageActions}>
        {canStart ? (
          <Pressable
            onPress={() => onAdvance(stage, 'in_progress')}
            disabled={isBusy}
            style={({ pressed }) => [
              styles.stageButton,
              styles.stageButtonPrimary,
              (pressed || isBusy) && styles.stageButtonPressed,
            ]}
          >
            <Text style={styles.stageButtonPrimaryText}>Iniciar</Text>
          </Pressable>
        ) : null}
        {isInProgress ? (
          <Pressable
            onPress={() => onAdvance(stage, 'completed')}
            disabled={isBusy}
            style={({ pressed }) => [
              styles.stageButton,
              styles.stageButtonPrimary,
              (pressed || isBusy) && styles.stageButtonPressed,
            ]}
          >
            <Text style={styles.stageButtonPrimaryText}>Concluir etapa</Text>
          </Pressable>
        ) : null}
        {isCompleted ? (
          <Pressable
            onPress={() => onAdvance(stage, 'in_progress')}
            disabled={isBusy}
            style={({ pressed }) => [
              styles.stageButton,
              styles.stageButtonSecondary,
              (pressed || isBusy) && styles.stageButtonPressed,
            ]}
          >
            <Text style={styles.stageButtonSecondaryText}>Reabrir</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function stageStatusLabel(status: ProductionStage['status']) {
  switch (status) {
    case 'pending':
      return 'Pendente';
    case 'ready':
      return 'Pronta';
    case 'in_progress':
      return 'Em andamento';
    case 'paused':
      return 'Pausada';
    case 'completed':
      return 'Concluída';
    case 'cancelled':
      return 'Cancelada';
    default:
      return status;
  }
}

export function ProductionExecutionScreen() {
  const route = useRoute<RouteProp<AppStackParamList, 'ProductionExecution'>>();
  const { planId } = route.params;
  const { user } = useAuth();
  const authorization = useAuthorization(user);

  const {
    plan,
    isLoading: isLoadingPlan,
    error: planError,
    retry: retryPlan,
  } = useProductionPlan(planId);

  const {
    stages,
    isLoading: isLoadingStages,
    error: stagesError,
    update: updateStage,
    retry: retryStages,
  } = useProductionStages({ planId });

  const {
    divergences,
    isLoading: isLoadingDivergences,
    error: divergencesError,
    create: createDivergence,
    retry: retryDivergences,
  } = useProductionDivergences({ planId, limit: 20 });

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const totalStages = stages.length;
  const completedStages = stages.filter(stage => stage.status === 'completed').length;
  const progressRatio = totalStages === 0 ? 0 : completedStages / totalStages;

  const handleRetry = useCallback(() => {
    retryPlan();
    retryStages();
    retryDivergences();
  }, [retryPlan, retryStages, retryDivergences]);

  const handleAdvanceStage = useCallback(
    async (stage: ProductionStage, nextStatus: 'in_progress' | 'completed') => {
      if (!authorization.canAdvanceProduction) {
        Alert.alert('Sem permissão', 'Você não pode atualizar o status das etapas.');
        return;
      }

      setIsProcessing(true);
      try {
        await updateStage(stage.id, {
          status: nextStatus,
          startedAt: nextStatus === 'in_progress' ? new Date() : stage.startedAt ?? new Date(),
          completedAt: nextStatus === 'completed' ? new Date() : null,
        });
      } catch (advanceError) {
        logAndAlertError(advanceError, 'Não foi possível atualizar a etapa.');
      } finally {
        setIsProcessing(false);
      }
    },
    [authorization.canAdvanceProduction, updateStage],
  );

  const handleStartPlan = useCallback(async () => {
    if (!authorization.canAdvanceProduction) {
      Alert.alert('Sem permissão', 'Você não pode iniciar produções.');
      return;
    }

    setIsProcessing(true);
    try {
      await startProductionPlanExecution(planId);
    } catch (startError) {
      logAndAlertError(startError, 'Não foi possível iniciar a produção.');
    } finally {
      setIsProcessing(false);
    }
  }, [authorization.canAdvanceProduction, planId]);

  const handleCompletePlan = useCallback(async () => {
    if (!authorization.canAdvanceProduction) {
      Alert.alert('Sem permissão', 'Você não pode concluir produções.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Usuário inválido', 'Faça login novamente para concluir a produção.');
      return;
    }

    Alert.alert(
      'Concluir produção',
      'Estoques serão baixados automaticamente. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Concluir',
          style: 'destructive',
          onPress: async () => {
            setIsCompleting(true);
            try {
              const result = await completeProductionPlanWithConsumption({
                planId,
                performedBy: user.id,
              });

              if (result.divergences.length > 0) {
                Alert.alert(
                  'Produção concluída com divergências',
                  `${result.divergences.length} divergências foram registradas automaticamente.`,
                );
              } else {
                Alert.alert('Produção concluída', 'Estoque atualizado com sucesso.');
              }
            } catch (completeError) {
              logAndAlertError(completeError, 'Erro ao concluir a produção. Confira o estoque.');
            } finally {
              setIsCompleting(false);
            }
          },
        },
      ],
    );
  }, [authorization.canAdvanceProduction, planId, user?.id]);

  const handleRegisterDivergence = useCallback(async () => {
    if (!authorization.canAdvanceProduction) {
      Alert.alert('Sem permissão', 'Você não pode registrar divergências.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Usuário inválido', 'Faça login novamente para registrar a divergência.');
      return;
    }

    try {
      await createDivergence({
        planId,
        reportedBy: user.id,
        severity: 'medium',
        type: 'other',
        description: 'Divergência registrada manualmente.',
      });
      Alert.alert('Divergência registrada', 'Revise a lista para complementar os detalhes.');
    } catch (divergenceError) {
      logAndAlertError(divergenceError, 'Não foi possível registrar a divergência.');
    }
  }, [authorization.canAdvanceProduction, createDivergence, planId, user?.id]);

  const stageProgressLabel = useMemo(() => {
    if (totalStages === 0) {
      return 'Nenhuma etapa cadastrada';
    }

    const percentage = Math.round(progressRatio * 100);
    return `${percentage}% das etapas concluídas (${completedStages}/${totalStages})`;
  }, [completedStages, totalStages, progressRatio]);

  const hasError = planError || stagesError || divergencesError;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.heading}>Execução da produção</Text>
            <Text style={styles.subheading}>
              Acompanhe etapas, estoque e divergências em tempo real.
            </Text>
          </View>
          {hasError ? (
            <Pressable
              onPress={handleRetry}
              style={({ pressed }) => [styles.retryChip, pressed && styles.retryChipPressed]}
            >
              <Text style={styles.retryChipText}>Atualizar</Text>
            </Pressable>
          ) : null}
        </View>

        {isLoadingPlan || !plan ? (
          <ActivityIndicator color="#4E9F3D" style={styles.loader} />
        ) : (
          <View style={styles.planOverview}>
            <View style={styles.planOverviewRow}>
              <Text style={styles.planTitle}>{plan.recipeName}</Text>
              <View style={[styles.planStatusBadge, styles[`planStatus_${plan.status}` as const]]}>
                <Text
                  style={[styles.planStatusBadgeText, styles[`planStatusText_${plan.status}` as const]]}
                >
                  {planStatusLabel(plan.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.planMeta}>
              {plan.quantityInUnits}{' '}
              {plan.unitOfMeasure === 'GRAMS' ? 'g' : 'un'} · Agendado para{' '}
              {plan.scheduledFor.toLocaleDateString('pt-BR')} às{' '}
              {plan.scheduledFor.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <View style={styles.planTimelineRow}>
              <View style={styles.planTimelineCol}>
                <Text style={styles.timelineLabel}>Início</Text>
                <Text style={styles.timelineValue}>
                  {plan.startedAt ? plan.startedAt.toLocaleString('pt-BR') : 'Não iniciado'}
                </Text>
              </View>
              <View style={styles.planTimelineCol}>
                <Text style={styles.timelineLabel}>Conclusão</Text>
                <Text style={styles.timelineValue}>
                  {plan.completedAt ? plan.completedAt.toLocaleString('pt-BR') : 'Pendente'}
                </Text>
              </View>
            </View>
            {plan.notes ? <Text style={styles.planNotes}>{plan.notes}</Text> : null}
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { flex: progressRatio }]} />
              <View style={[styles.progressBarRemaining, { flex: 1 - progressRatio }]} />
            </View>
            <Text style={styles.progressLabel}>{stageProgressLabel}</Text>
            <View style={styles.actionsRow}>
              {plan.status !== 'in_progress' && plan.status !== 'completed' ? (
                <Pressable
                  onPress={handleStartPlan}
                  disabled={isProcessing || isCompleting}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionButtonPrimary,
                    (pressed || isProcessing || isCompleting) && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.actionButtonPrimaryText}>Iniciar produção</Text>
                </Pressable>
              ) : null}
              {plan.status !== 'completed' ? (
                <Pressable
                  onPress={handleCompletePlan}
                  disabled={isCompleting || isProcessing}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionButtonDanger,
                    (pressed || isCompleting || isProcessing) && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.actionButtonDangerText}>
                    {isCompleting ? 'Concluindo…' : 'Concluir e baixar estoque'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Etapas</Text>
          {isLoadingStages ? <ActivityIndicator color="#4E9F3D" /> : null}
        </View>
        {stages.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma etapa cadastrada para este plano.</Text>
        ) : (
          <View style={styles.stageList}>
            {stages
              .slice()
              .sort((a, b) => a.sequence - b.sequence)
              .map(stage => (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  onAdvance={handleAdvanceStage}
                  isBusy={isProcessing || isCompleting}
                />
              ))}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Divergências</Text>
          <Pressable
            onPress={handleRegisterDivergence}
            disabled={isProcessing}
            style={({ pressed }) => [
              styles.linkButton,
              pressed && styles.linkButtonPressed,
              isProcessing && styles.linkButtonDisabled,
            ]}
          >
            <Text style={styles.linkButtonText}>Registrar divergência</Text>
          </Pressable>
        </View>
        {isLoadingDivergences ? (
          <ActivityIndicator color="#4E9F3D" />
        ) : divergences.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma divergência registrada.</Text>
        ) : (
          <View style={styles.divergenceList}>
            {divergences.map(divergence => (
              <View key={divergence.id} style={styles.divergenceCard}>
                <View style={styles.divergenceHeader}>
                  <View style={[styles.divergenceSeverity, styles[`divergenceSeverity_${divergence.severity}` as const]]}>
                    <Text
                      style={[
                        styles.divergenceSeverityText,
                        styles[`divergenceSeverityText_${divergence.severity}` as const],
                      ]}
                    >
                      {divergenceSeverityLabel(divergence.severity)}
                    </Text>
                  </View>
                  <Text style={styles.divergenceTimestamp}>
                    {formatRelativeDate(divergence.createdAt)}
                  </Text>
                </View>
                <Text style={styles.divergenceDescription}>{divergence.description}</Text>
                {divergence.resolutionNotes ? (
                  <Text style={styles.divergenceResolution}>
                    Resolução: {divergence.resolutionNotes}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function planStatusLabel(status: ProductionPlan['status']) {
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

function divergenceSeverityLabel(severity: string) {
  switch (severity) {
    case 'low':
      return 'Baixa';
    case 'medium':
      return 'Média';
    case 'high':
      return 'Alta';
    default:
      return severity;
  }
}

function logAndAlertError(error: unknown, fallback: string) {
  console.warn(error);
  Alert.alert('Ops!', fallback);
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#F87171',
  },
  retryChipPressed: {
    opacity: 0.8,
  },
  retryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
  },
  loader: {
    marginTop: 40,
  },
  planOverview: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    gap: 12,
  },
  planOverviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  planTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  planStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  planStatusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  planStatus_scheduled: {
    backgroundColor: '#DBEAFE',
  },
  planStatusText_scheduled: {
    color: '#1D4ED8',
  },
  planStatus_in_progress: {
    backgroundColor: '#FEF3C7',
  },
  planStatusText_in_progress: {
    color: '#B45309',
  },
  planStatus_completed: {
    backgroundColor: '#DCFCE7',
  },
  planStatusText_completed: {
    color: '#166534',
  },
  planStatus_cancelled: {
    backgroundColor: '#FEE2E2',
  },
  planStatusText_cancelled: {
    color: '#B91C1C',
  },
  planStatus_draft: {
    backgroundColor: '#E0E7FF',
  },
  planStatusText_draft: {
    color: '#4C1D95',
  },
  planMeta: {
    fontSize: 14,
    color: '#4B5563',
  },
  planTimelineRow: {
    flexDirection: 'row',
    gap: 16,
  },
  planTimelineCol: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  timelineLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  timelineValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  planNotes: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 20,
  },
  progressBarContainer: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  progressBarFill: {
    backgroundColor: '#4E9F3D',
  },
  progressBarRemaining: {
    backgroundColor: 'transparent',
  },
  progressLabel: {
    marginTop: 8,
    fontSize: 13,
    color: '#4B5563',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  actionButton: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  actionButtonPrimary: {
    backgroundColor: '#2563EB',
  },
  actionButtonDanger: {
    backgroundColor: '#DC2626',
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonDangerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  stageList: {
    gap: 16,
  },
  stageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  stageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  stageTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  stageMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  stageDescription: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 20,
  },
  stageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  stageBadge_pending: {
    backgroundColor: '#E5E7EB',
  },
  stageBadgeText_pending: {
    color: '#4B5563',
  },
  stageBadge_ready: {
    backgroundColor: '#F0FFF4',
  },
  stageBadgeText_ready: {
    color: '#2F855A',
  },
  stageBadge_in_progress: {
    backgroundColor: '#FEF3C7',
  },
  stageBadgeText_in_progress: {
    color: '#B45309',
  },
  stageBadge_paused: {
    backgroundColor: '#FEE2E2',
  },
  stageBadgeText_paused: {
    color: '#B91C1C',
  },
  stageBadge_completed: {
    backgroundColor: '#DCFCE7',
  },
  stageBadgeText_completed: {
    color: '#166534',
  },
  stageBadge_cancelled: {
    backgroundColor: '#F3F4F6',
  },
  stageBadgeText_cancelled: {
    color: '#6B7280',
  },
  stageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stageButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stageButtonPrimary: {
    backgroundColor: '#2563EB',
  },
  stageButtonSecondary: {
    borderWidth: 1,
    borderColor: '#9CA3AF',
    backgroundColor: '#FFFFFF',
  },
  stageButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  stageButtonSecondaryText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  stageButtonPressed: {
    opacity: 0.8,
  },
  linkButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  linkButtonPressed: {
    opacity: 0.85,
  },
  linkButtonDisabled: {
    opacity: 0.6,
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  divergenceList: {
    marginTop: 8,
    gap: 12,
  },
  divergenceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  divergenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divergenceSeverity: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  divergenceSeverityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divergenceSeverity_low: {
    backgroundColor: '#ECFDF5',
  },
  divergenceSeverityText_low: {
    color: '#047857',
  },
  divergenceSeverity_medium: {
    backgroundColor: '#FEF3C7',
  },
  divergenceSeverityText_medium: {
    color: '#B45309',
  },
  divergenceSeverity_high: {
    backgroundColor: '#FEE2E2',
  },
  divergenceSeverityText_high: {
    color: '#B91C1C',
  },
  divergenceTimestamp: {
    fontSize: 12,
    color: '#6B7280',
  },
  divergenceDescription: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
  },
  divergenceResolution: {
    fontSize: 12,
    color: '#6B7280',
  },
});

export default ProductionExecutionScreen;
