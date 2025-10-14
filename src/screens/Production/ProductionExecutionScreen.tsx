import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

// Type-only imports first

// Value imports
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import {
  useProductionPlan,
  useProductionStages,
  useProductionDivergences,
  useProductionPlanAvailability,
} from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { getUserProfile } from '@/services/firestore/usersService';
import {
  completeProductionPlanWithConsumption,
  startProductionPlanExecution,
} from '@/services/productionExecution';
import { formatRelativeDate } from '@/utils/date';
import type {
  IngredientAvailability,
  ProductionDivergence,
  ProductionPlan,
  ProductionPlanAvailabilityRecord,
  ProductionStage,
  StockMovement,
} from '@/domain';
import type { AppStackParamList } from '@/navigation';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

function StageCard({
  stage,
  onAdvance,
  onEdit,
  canEdit,
  isBusy,
}: {
  stage: ProductionStage;
  onAdvance: (
    stage: ProductionStage,
    nextStatus: 'in_progress' | 'completed',
  ) => Promise<void>;
  onEdit?: (stage: ProductionStage) => void;
  canEdit: boolean;
  isBusy: boolean;
}) {
  const isCompleted = stage.status === 'completed';
  const isInProgress = stage.status === 'in_progress';
  const canStart =
    stage.status === 'pending' || stage.status === 'ready' || stage.status === 'paused';

  return (
    <View style={styles.stageCard}>
      <View style={styles.stageHeader}>
        <View style={styles.stageTitleWrapper}>
          <Text style={styles.stageTitle}>
            {stage.sequence}. {stage.name}
          </Text>
          <View
            style={[styles.stageBadge, styles[`stageBadge_${stage.status}` as const]]}
          >
            <Text
              style={[
                styles.stageBadgeText,
                styles[`stageBadgeText_${stage.status}` as const],
              ]}
            >
              {stageStatusLabel(stage.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.stageMeta}>
          Atualizado {formatRelativeDate(stage.updatedAt)}
        </Text>
      </View>
      {stage.description ? (
        <Text style={styles.stageDescription}>{stage.description}</Text>
      ) : null}
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
        {canEdit ? (
          <Pressable
            onPress={() => onEdit?.(stage)}
            disabled={isBusy}
            style={({ pressed }) => [
              styles.stageButton,
              styles.stageButtonSecondary,
              styles.stageButtonGhost,
              (pressed || isBusy) && styles.stageButtonPressed,
            ]}
          >
            <Text style={styles.stageButtonSecondaryText}>Editar</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function formatGrams(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '0g';
  }

  return `${value.toLocaleString('pt-BR', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  })}g`;
}

const availabilityStatusCopy: Record<
  ProductionPlanAvailabilityRecord['status'],
  {
    title: string;
    description: string;
    badgeLabel: string;
  }
> = {
  insufficient: {
    title: 'Plano aprovado com falta',
    description:
      'A produção foi autorizada mesmo com indisponibilidade de insumos. Garanta que a equipe saiba desta condição antes de iniciar.',
    badgeLabel: 'Falta aprovada',
  },
  reconciled: {
    title: 'Faltas confirmadas na execução',
    description:
      'As faltas previstas foram registradas como divergências durante a baixa de estoque. Use o relatório de divergências para investigar.',
    badgeLabel: 'Divergências registradas',
  },
  fulfilled: {
    title: 'Falta sanada antes da execução',
    description:
      'O estoque foi reposto ou ajustado antes da baixa. Nenhuma falta foi registrada durante a execução.',
    badgeLabel: 'Estoque reposto',
  },
  sufficient: {
    title: 'Estoque suficiente',
    description: 'A checagem de disponibilidade não encontrou faltas para este plano.',
    badgeLabel: 'Sem falta',
  },
};

function AvailabilityInsightsCard({
  record,
}: {
  record: ProductionPlanAvailabilityRecord;
}) {
  const copy =
    availabilityStatusCopy[record.status] ?? availabilityStatusCopy.insufficient;
  const topShortages = record.shortages.slice(0, 3);
  const remainingShortages = Math.max(0, record.shortages.length - topShortages.length);
  const confirmedAtLabel = record.confirmedAt
    ? `${record.confirmedAt.toLocaleDateString('pt-BR')} às ${record.confirmedAt.toLocaleTimeString(
        'pt-BR',
        {
          hour: '2-digit',
          minute: '2-digit',
        },
      )}`
    : null;

  const cardStatusStyle = (() => {
    switch (record.status) {
      case 'reconciled':
        return styles.availabilityCard_reconciled;
      case 'fulfilled':
        return styles.availabilityCard_fulfilled;
      case 'sufficient':
        return styles.availabilityCard_sufficient;
      case 'insufficient':
      default:
        return styles.availabilityCard_insufficient;
    }
  })();

  const badgeStatusStyle = (() => {
    switch (record.status) {
      case 'reconciled':
        return styles.availabilityBadge_reconciled;
      case 'fulfilled':
        return styles.availabilityBadge_fulfilled;
      case 'sufficient':
        return styles.availabilityBadge_sufficient;
      case 'insufficient':
      default:
        return styles.availabilityBadge_insufficient;
    }
  })();

  const badgeTextStatusStyle = (() => {
    switch (record.status) {
      case 'reconciled':
        return styles.availabilityBadgeText_reconciled;
      case 'fulfilled':
        return styles.availabilityBadgeText_fulfilled;
      case 'sufficient':
        return styles.availabilityBadgeText_sufficient;
      case 'insufficient':
      default:
        return styles.availabilityBadgeText_insufficient;
    }
  })();

  return (
    <View style={[styles.availabilityCard, cardStatusStyle]}>
      <View style={styles.availabilityHeader}>
        <Text style={styles.availabilityTitle}>{copy.title}</Text>
        <View style={[styles.availabilityBadge, badgeStatusStyle]}>
          <Text style={[styles.availabilityBadgeText, badgeTextStatusStyle]}>
            {copy.badgeLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.availabilityDescription}>{copy.description}</Text>

      <View style={styles.availabilityMetricsRow}>
        <View style={styles.availabilityMetric}>
          <Text style={styles.availabilityMetricLabel}>Falta total prevista</Text>
          <Text style={styles.availabilityMetricValue}>
            {formatGrams(record.totalShortageInGrams)}
          </Text>
        </View>
        <View style={styles.availabilityMetric}>
          <Text style={styles.availabilityMetricLabel}>Requisitado</Text>
          <Text style={styles.availabilityMetricValue}>
            {formatGrams(record.totalRequiredInGrams)}
          </Text>
        </View>
      </View>

      {record.actualShortageInGrams !== undefined &&
      record.actualShortageInGrams !== null ? (
        <View style={styles.availabilityExecutionRow}>
          <Text style={styles.availabilityExecutionLabel}>Resultado real</Text>
          <Text style={styles.availabilityExecutionValue}>
            {record.actualShortageInGrams > 0
              ? `Faltaram ${formatGrams(record.actualShortageInGrams)}`
              : 'Sem faltas registradas'}
          </Text>
        </View>
      ) : null}

      {topShortages.length > 0 ? (
        <View style={styles.availabilityShortageList}>
          {topShortages.map((item: IngredientAvailability) => (
            <Text key={item.productId} style={styles.availabilityShortageItem}>
              • {item.productId} · Falta de {formatGrams(item.shortageInGrams)}
            </Text>
          ))}
          {remainingShortages > 0 ? (
            <Text style={styles.availabilityShortageMore}>
              +{remainingShortages} insumo(s) adicional(is) com falta
            </Text>
          ) : null}
        </View>
      ) : null}

      {record.confirmedBy ? (
        <Text style={styles.availabilityFooter}>
          Confirmado por {record.confirmedBy}
          {confirmedAtLabel ? ` em ${confirmedAtLabel}` : ''}
        </Text>
      ) : null}
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

type StageFormValues = {
  name: string;
  description: string;
  sequence: string;
};

type StageModalState = {
  mode: 'create' | 'edit';
  stage?: ProductionStage;
  initialValues: StageFormValues;
};

type StageFormModalProps = {
  visible: boolean;
  state: StageModalState | null;
  onClose: () => void;
  onSubmit: (values: StageFormValues) => Promise<void>;
  isSubmitting: boolean;
};

function StageFormModal({
  visible,
  state,
  onClose,
  onSubmit,
  isSubmitting,
}: StageFormModalProps) {
  const [formValues, setFormValues] = useState<StageFormValues>(
    state?.initialValues ?? { name: '', description: '', sequence: '1' },
  );

  useEffect(() => {
    if (state) {
      setFormValues(state.initialValues);
    }
  }, [state]);

  const updateValue = useCallback((field: keyof StageFormValues, value: string) => {
    setFormValues(previous => ({ ...previous, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedName = formValues.name.trim();
    if (!trimmedName) {
      Alert.alert('Nome obrigatório', 'Informe um nome para a etapa.');
      return;
    }

    const parsedSequence = Number(formValues.sequence);
    if (!Number.isFinite(parsedSequence) || parsedSequence <= 0) {
      Alert.alert('Sequência inválida', 'Informe uma ordem numérica maior que zero.');
      return;
    }

    await onSubmit({
      name: trimmedName,
      description: formValues.description,
      sequence: String(parsedSequence),
    });
  }, [formValues, isSubmitting, onSubmit]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {state?.mode === 'edit' ? 'Editar etapa' : 'Nova etapa'}
          </Text>
          <KeyboardAwareScrollView
            style={styles.modalForm}
            contentContainerStyle={styles.modalFormContent}
            keyboardShouldPersistTaps="handled"
            enableOnAndroid
            extraScrollHeight={Platform.OS === 'android' ? 20 : 0}
          >
            <Text style={styles.modalLabel}>Nome</Text>
            <TextInput
              value={formValues.name}
              onChangeText={value => updateValue('name', value)}
              placeholder="Ex: Mistura da base"
              style={styles.modalInput}
              editable={!isSubmitting}
              showSoftInputOnFocus={Platform.OS === 'android' ? true : undefined}
            />

            <Text style={styles.modalLabel}>Descrição</Text>
            <TextInput
              value={formValues.description}
              onChangeText={value => updateValue('description', value)}
              placeholder="Detalhes, responsáveis ou observações"
              style={[styles.modalInput, styles.modalInputMultiline]}
              multiline
              numberOfLines={4}
              editable={!isSubmitting}
              showSoftInputOnFocus={Platform.OS === 'android' ? true : undefined}
            />

            <Text style={styles.modalLabel}>Ordem</Text>
            <TextInput
              value={formValues.sequence}
              onChangeText={value =>
                updateValue('sequence', value.replace(/[^0-9]/g, ''))
              }
              placeholder="1"
              style={styles.modalInput}
              keyboardType="number-pad"
              editable={!isSubmitting}
              showSoftInputOnFocus={Platform.OS === 'android' ? true : undefined}
            />
          </KeyboardAwareScrollView>

          <View style={styles.modalActions}>
            <Pressable
              onPress={onClose}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.modalActionButton,
                styles.modalActionSecondary,
                pressed && styles.modalActionPressed,
              ]}
            >
              <Text style={styles.modalActionSecondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.modalActionButton,
                styles.modalActionPrimary,
                (pressed || isSubmitting) && styles.modalActionPressed,
              ]}
            >
              <Text style={styles.modalActionPrimaryText}>
                {isSubmitting ? 'Salvando…' : 'Salvar etapa'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type CompletionSummary = {
  timestamp: Date;
  adjustments: StockMovement[];
  divergences: ProductionDivergence[];
};

export function ProductionExecutionScreen() {
  const route = useRoute<RouteProp<AppStackParamList, 'ProductionExecution'>>();
  const { planId } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
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
    create: createStage,
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

  const {
    record: availabilityRecord,
    isLoading: isLoadingAvailability,
    error: availabilityError,
    retry: retryAvailability,
  } = useProductionPlanAvailability(planId);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const completionRequestedRef = useRef(false);
  const [isSubmittingStage, setIsSubmittingStage] = useState(false);
  const [stageModalState, setStageModalState] = useState<StageModalState | null>(null);
  const [lastCompletionSummary, setLastCompletionSummary] =
    useState<CompletionSummary | null>(null);

  useEffect(() => {
    setLastCompletionSummary(null);
  }, [planId]);

  const totalStages = stages.length;
  const completedStages = stages.filter(stage => stage.status === 'completed').length;
  const progressRatio = totalStages === 0 ? 0 : completedStages / totalStages;

  const canManageStages = authorization.canScheduleProduction;

  const handleRetry = useCallback(() => {
    retryPlan();
    retryStages();
    retryDivergences();
    retryAvailability();
  }, [retryAvailability, retryPlan, retryStages, retryDivergences]);

  const handleOpenIngredientSummary = useCallback(() => {
    if (!plan) {
      return;
    }

    navigation.navigate('ProductionIngredientSummary', { planId: plan.id });
  }, [navigation, plan]);

  const closeStageModal = useCallback(() => {
    setStageModalState(null);
  }, []);

  const handleOpenCreateStage = useCallback(() => {
    if (!canManageStages) {
      Alert.alert('Sem permissão', 'Você não pode cadastrar novas etapas.');
      return;
    }

    const highestSequence = stages.reduce(
      (maxSequence, stage) => Math.max(maxSequence, stage.sequence),
      0,
    );
    setStageModalState({
      mode: 'create',
      initialValues: {
        name: '',
        description: '',
        sequence: String(highestSequence + 1 || 1),
      },
    });
  }, [canManageStages, stages]);

  const handleEditStage = useCallback(
    (stage: ProductionStage) => {
      if (!canManageStages) {
        Alert.alert('Sem permissão', 'Você não pode editar etapas de produção.');
        return;
      }

      setStageModalState({
        mode: 'edit',
        stage,
        initialValues: {
          name: stage.name,
          description: stage.description ?? '',
          sequence: String(stage.sequence),
        },
      });
    },
    [canManageStages],
  );

  const handleSubmitStageForm = useCallback(
    async (values: StageFormValues) => {
      if (!stageModalState) {
        return;
      }

      const trimmedName = values.name.trim();
      const trimmedDescription = values.description.trim();
      const sequenceNumber = Number(values.sequence);

      if (!Number.isFinite(sequenceNumber) || sequenceNumber <= 0) {
        Alert.alert('Sequência inválida', 'Informe uma ordem numérica maior que zero.');
        return;
      }

      setIsSubmittingStage(true);

      try {
        if (stageModalState.mode === 'create') {
          await createStage({
            planId,
            name: trimmedName,
            description: trimmedDescription ? trimmedDescription : undefined,
            sequence: sequenceNumber,
          });
        } else if (stageModalState.stage) {
          await updateStage(stageModalState.stage.id, {
            name: trimmedName,
            description: trimmedDescription ? trimmedDescription : undefined,
            sequence: sequenceNumber,
          });
        }

        closeStageModal();
      } catch (stageError) {
        logAndAlertError(stageError, 'Não foi possível salvar a etapa.');
      } finally {
        setIsSubmittingStage(false);
      }
    },
    [closeStageModal, createStage, planId, stageModalState, updateStage],
  );

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
          startedAt:
            nextStatus === 'in_progress' ? new Date() : (stage.startedAt ?? new Date()),
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

    const executeStart = async () => {
      setIsProcessing(true);
      try {
        await startProductionPlanExecution(planId);
      } catch (startError) {
        logAndAlertError(startError, 'Não foi possível iniciar a produção.');
      } finally {
        setIsProcessing(false);
      }
    };

    if (availabilityRecord?.status === 'insufficient') {
      Alert.alert(
        'Confirmar início com faltas',
        'Este plano foi aprovado mesmo com falta de insumos. Deseja iniciar assim mesmo?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Iniciar mesmo assim',
            style: 'destructive',
            onPress: () => {
              executeStart().catch(() => undefined);
            },
          },
        ],
      );
      return;
    }

    await executeStart();
  }, [availabilityRecord?.status, authorization.canAdvanceProduction, planId]);

  const handleCompletePlan = useCallback(async () => {
    console.log('🔵 [ProductionExecution] handleCompletePlan chamado', {
      planId,
      userId: user?.id,
      canAdvance: authorization.canAdvanceProduction,
    });

    // Prevent re-entrancy: if a completion flow was already requested, ignore.
    if (completionRequestedRef.current) {
      console.log(
        '🔒 [ProductionExecution] Conclusão já solicitada — ignorando clique adicional',
      );
      return;
    }

    if (!authorization.canAdvanceProduction) {
      console.log('❌ [ProductionExecution] Sem permissão para concluir');
      Alert.alert('Sem permissão', 'Você não pode concluir produções.');
      return;
    }

    if (!user?.id) {
      console.log('❌ [ProductionExecution] Usuário inválido');
      Alert.alert('Usuário inválido', 'Faça login novamente para concluir a produção.');
      return;
    }

    const confirmMessage =
      availabilityRecord?.status === 'insufficient'
        ? 'Estoques serão baixados automaticamente e as faltas aprovadas serão registradas como divergências. Deseja continuar?'
        : 'Estoques serão baixados automaticamente. Deseja continuar?';

    console.log('📝 [ProductionExecution] Mostrando confirmação para o usuário');

    // Mark that a completion flow has been requested to avoid showing multiple alerts
    completionRequestedRef.current = true;

    Alert.alert('Concluir produção', confirmMessage, [
      {
        text: 'Cancelar',
        style: 'cancel',
        onPress: () => {
          console.log('🚫 [ProductionExecution] Usuário cancelou a conclusão');
          // Reset request guard when user cancels
          completionRequestedRef.current = false;
        },
      },
      {
        text: 'Concluir',
        style: 'destructive',
        onPress: async () => {
          console.log('✅ [ProductionExecution] Usuário confirmou - iniciando conclusão');
          setIsCompleting(true);
          try {
            // Double-check the user's authoritative profile in Firestore before
            // attempting writes controlled by security rules. This prevents
            // confusing "missing permissions" errors when the local auth
            // state is out-of-sync with the Firestore users collection.
            const profile = await getUserProfile(user.id).catch(() => null);
            const allowedRoles = new Set([
              'admin',
              'manager',
              'gelatie',
              'Gelatie',
              'GELATIE',
              'produtor',
              'Produtor',
              'PRODUTOR',
            ]);
            if (!profile || !allowedRoles.has(profile.role)) {
              console.log('[ProductionExecution] Permissão Firestore insuficiente', {
                profile,
              });
              Alert.alert(
                'Sem permissão',
                'Seu perfil no servidor não tem permissão para concluir produções. Peça a um administrador para atribuir o papel apropriado (ex.: produtor).',
              );
              setIsCompleting(false);
              return;
            }
            console.log(
              '🚀 [ProductionExecution] Chamando completeProductionPlanWithConsumption',
              {
                planId,
                performedBy: user.id,
              },
            );
            const result = await completeProductionPlanWithConsumption({
              planId,
              performedBy: user.id,
            });
            console.log('🎉 [ProductionExecution] Produção concluída com sucesso!', {
              adjustmentsCount: result.adjustments.length,
              divergencesCount: result.divergences.length,
              actualCost: result.plan.actualProductionCostInBRL,
            });

            setLastCompletionSummary({
              timestamp: result.plan.completedAt ?? new Date(),
              adjustments: result.adjustments,
              divergences: result.divergences,
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
            console.error(
              '💥 [ProductionExecution] ERRO ao concluir produção:',
              completeError,
            );
            console.error(
              '💥 [ProductionExecution] Stack trace:',
              completeError instanceof Error ? completeError.stack : 'sem stack',
            );
            logAndAlertError(
              completeError,
              'Erro ao concluir a produção. Confira o estoque.',
            );
          } finally {
            console.log('🏁 [ProductionExecution] Finalizando (setIsCompleting false)');
            setIsCompleting(false);
            // Allow future completion attempts
            completionRequestedRef.current = false;
          }
        },
      },
    ]);
  }, [authorization.canAdvanceProduction, availabilityRecord?.status, planId, user?.id]);

  const handleRegisterDivergence = useCallback(async () => {
    if (!authorization.canAdvanceProduction) {
      Alert.alert('Sem permissão', 'Você não pode registrar divergências.');
      return;
    }

    if (!user?.id) {
      Alert.alert(
        'Usuário inválido',
        'Faça login novamente para registrar a divergência.',
      );
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
      Alert.alert(
        'Divergência registrada',
        'Revise a lista para complementar os detalhes.',
      );
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

  const hasError = planError || stagesError || divergencesError || availabilityError;

  return (
    <>
      <ScreenContainer>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
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
                style={({ pressed }) => [
                  styles.retryChip,
                  pressed && styles.retryChipPressed,
                ]}
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
                <View
                  style={[
                    styles.planStatusBadge,
                    styles[`planStatus_${plan.status}` as const],
                  ]}
                >
                  <Text
                    style={[
                      styles.planStatusBadgeText,
                      styles[`planStatusText_${plan.status}` as const],
                    ]}
                  >
                    {planStatusLabel(plan.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.planMeta}>
                {plan.quantityInUnits} {plan.unitOfMeasure === 'GRAMS' ? 'g' : 'un'} ·
                Agendado para {plan.scheduledFor.toLocaleDateString('pt-BR')} às{' '}
                {plan.scheduledFor.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              <View style={styles.planTimelineRow}>
                <View style={styles.planTimelineCol}>
                  <Text style={styles.timelineLabel}>Início</Text>
                  <Text style={styles.timelineValue}>
                    {plan.startedAt
                      ? plan.startedAt.toLocaleString('pt-BR')
                      : 'Não iniciado'}
                  </Text>
                </View>
                <View style={styles.planTimelineCol}>
                  <Text style={styles.timelineLabel}>Conclusão</Text>
                  <Text style={styles.timelineValue}>
                    {plan.completedAt
                      ? plan.completedAt.toLocaleString('pt-BR')
                      : 'Pendente'}
                  </Text>
                </View>
              </View>
              {plan.notes ? <Text style={styles.planNotes}>{plan.notes}</Text> : null}
              {availabilityError ? (
                <Pressable
                  onPress={retryAvailability}
                  style={({ pressed }) => [
                    styles.availabilityErrorBanner,
                    pressed && styles.availabilityErrorBannerPressed,
                  ]}
                >
                  <Text style={styles.availabilityErrorText}>
                    Não foi possível carregar a checagem de disponibilidade. Tocar para
                    tentar novamente.
                  </Text>
                </Pressable>
              ) : null}
              {isLoadingAvailability ? (
                <View style={styles.availabilityLoadingRow}>
                  <ActivityIndicator color="#F59E0B" size="small" />
                  <Text style={styles.availabilityLoadingText}>
                    Carregando confirmação de disponibilidade…
                  </Text>
                </View>
              ) : availabilityRecord ? (
                <AvailabilityInsightsCard record={availabilityRecord} />
              ) : null}
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { flex: progressRatio }]} />
                <View
                  style={[styles.progressBarRemaining, { flex: 1 - progressRatio }]}
                />
              </View>
              <Text style={styles.progressLabel}>{stageProgressLabel}</Text>
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={handleOpenIngredientSummary}
                  disabled={!plan}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionButtonSecondary,
                    pressed && plan && styles.actionButtonPressed,
                    !plan && styles.actionButtonDisabled,
                  ]}
                >
                  <Text style={styles.actionButtonSecondaryText}>Ver ingredientes</Text>
                </Pressable>
                {plan.status !== 'in_progress' && plan.status !== 'completed' ? (
                  <Pressable
                    onPress={handleStartPlan}
                    disabled={isProcessing || isCompleting}
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.actionButtonPrimary,
                      (pressed || isProcessing || isCompleting) &&
                        styles.actionButtonPressed,
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
                      (pressed || isCompleting || isProcessing) &&
                        styles.actionButtonPressed,
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
            <View style={styles.sectionActions}>
              {isLoadingStages ? <ActivityIndicator color="#4E9F3D" /> : null}
              {canManageStages ? (
                <Pressable
                  onPress={handleOpenCreateStage}
                  disabled={isProcessing || isCompleting || isSubmittingStage}
                  style={({ pressed }) => [
                    styles.sectionActionButton,
                    (pressed || isProcessing || isCompleting || isSubmittingStage) &&
                      styles.sectionActionButtonPressed,
                    (isProcessing || isCompleting || isSubmittingStage) &&
                      styles.sectionActionButtonDisabled,
                  ]}
                >
                  <Text style={styles.sectionActionButtonText}>Adicionar etapa</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          {stages.length === 0 ? (
            <Text style={styles.emptyText}>
              Nenhuma etapa cadastrada para este plano.
            </Text>
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
                    onEdit={handleEditStage}
                    canEdit={canManageStages}
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
                    <View
                      style={[
                        styles.divergenceSeverity,
                        styles[`divergenceSeverity_${divergence.severity}` as const],
                      ]}
                    >
                      <Text
                        style={[
                          styles.divergenceSeverityText,
                          styles[
                            `divergenceSeverityText_${divergence.severity}` as const
                          ],
                        ]}
                      >
                        {divergenceSeverityLabel(divergence.severity)}
                      </Text>
                    </View>
                    <Text style={styles.divergenceTimestamp}>
                      {formatRelativeDate(divergence.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.divergenceDescription}>
                    {divergence.description}
                  </Text>
                  {divergence.resolutionNotes ? (
                    <Text style={styles.divergenceResolution}>
                      Resolução: {divergence.resolutionNotes}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Movimentações recentes</Text>
          </View>
          {lastCompletionSummary ? (
            <View style={styles.adjustmentsSummary}>
              <Text style={styles.adjustmentSummaryInfo}>
                {lastCompletionSummary.adjustments.length} ajustes ·{' '}
                {lastCompletionSummary.divergences.length} divergências · Atualizado{' '}
                {formatRelativeDate(lastCompletionSummary.timestamp)}
              </Text>
              {lastCompletionSummary.adjustments.length === 0 ? (
                <Text style={styles.emptyText}>
                  Nenhum estoque foi movimentado na conclusão.
                </Text>
              ) : (
                <View style={styles.adjustmentList}>
                  {lastCompletionSummary.adjustments.map(adjustment => (
                    <View key={adjustment.id} style={styles.adjustmentCard}>
                      <Text style={styles.adjustmentProduct}>
                        Produto {adjustment.productId}
                      </Text>
                      <Text style={styles.adjustmentQuantity}>
                        -{adjustment.quantityInGrams} g · Restante{' '}
                        {adjustment.resultingQuantityInGrams} g
                      </Text>
                      <Text style={styles.adjustmentMeta}>
                        Registrado {formatRelativeDate(adjustment.performedAt)} por{' '}
                        {adjustment.performedBy}
                      </Text>
                      {adjustment.note ? (
                        <Text style={styles.adjustmentNote}>{adjustment.note}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Conclua uma produção para acompanhar os ajustes de estoque realizados
              automaticamente.
            </Text>
          )}
        </ScrollView>
      </ScreenContainer>
      <StageFormModal
        visible={Boolean(stageModalState)}
        state={stageModalState}
        onClose={closeStageModal}
        onSubmit={handleSubmitStageForm}
        isSubmitting={isSubmittingStage}
      />
    </>
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
  availabilityCard: {
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  availabilityCard_insufficient: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  availabilityCard_reconciled: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
  },
  availabilityCard_fulfilled: {
    backgroundColor: '#ECFDF5',
    borderColor: '#34D399',
  },
  availabilityCard_sufficient: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  availabilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availabilityTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  availabilityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  availabilityBadge_insufficient: {
    backgroundColor: '#F59E0B33',
  },
  availabilityBadge_reconciled: {
    backgroundColor: '#F8717133',
  },
  availabilityBadge_fulfilled: {
    backgroundColor: '#34D39933',
  },
  availabilityBadge_sufficient: {
    backgroundColor: '#6366F133',
  },
  availabilityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  availabilityBadgeText_insufficient: {
    color: '#92400E',
  },
  availabilityBadgeText_reconciled: {
    color: '#B91C1C',
  },
  availabilityBadgeText_fulfilled: {
    color: '#047857',
  },
  availabilityBadgeText_sufficient: {
    color: '#4338CA',
  },
  availabilityDescription: {
    fontSize: 13,
    color: '#4B5563',
  },
  availabilityMetricsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  availabilityMetric: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  availabilityMetricLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  availabilityMetricValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  availabilityExecutionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availabilityExecutionLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  availabilityExecutionValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  availabilityShortageList: {
    gap: 4,
  },
  availabilityShortageItem: {
    fontSize: 12,
    color: '#4B5563',
  },
  availabilityShortageMore: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  availabilityFooter: {
    fontSize: 11,
    color: '#6B7280',
  },
  availabilityLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  availabilityLoadingText: {
    fontSize: 12,
    color: '#6B7280',
  },
  availabilityErrorBanner: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  availabilityErrorBannerPressed: {
    opacity: 0.85,
  },
  availabilityErrorText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#B91C1C',
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
  actionButtonSecondary: {
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
  },
  actionButtonDanger: {
    backgroundColor: '#DC2626',
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonSecondaryText: {
    color: '#2563EB',
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
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  stageButtonGhost: {
    borderColor: '#E5E7EB',
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
  sectionActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  sectionActionButtonPressed: {
    opacity: 0.85,
  },
  sectionActionButtonDisabled: {
    opacity: 0.55,
  },
  sectionActionButtonText: {
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
  adjustmentsSummary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  adjustmentSummaryInfo: {
    fontSize: 13,
    color: '#4B5563',
  },
  adjustmentList: {
    gap: 12,
  },
  adjustmentCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 6,
  },
  adjustmentProduct: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  adjustmentQuantity: {
    fontSize: 13,
    color: '#1F2937',
  },
  adjustmentMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  adjustmentNote: {
    fontSize: 12,
    color: '#374151',
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalForm: {
    maxHeight: 320,
  },
  modalFormContent: {
    gap: 12,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  modalInputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalActionButton: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  modalActionPrimary: {
    backgroundColor: '#2563EB',
  },
  modalActionSecondary: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  modalActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalActionSecondaryText: {
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '600',
  },
  modalActionPressed: {
    opacity: 0.85,
  },
});

export default ProductionExecutionScreen;
