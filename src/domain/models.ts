export type DocumentId = string;

export type UnitOfMeasure = 'GRAMS' | 'MILLILITERS' | 'UNITS';

export type UserRole = 'gelatie' | 'estoquista' | 'produtor';

export interface EntityTimestamps {
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

export interface UserProfile extends EntityTimestamps {
  id: DocumentId;
  email: string;
  displayName?: string | null;
  role: UserRole;
  phoneNumber?: string | null;
}

export type UserProfileCreateInput = {
  email: string;
  displayName?: string | null;
  role?: UserRole;
  phoneNumber?: string | null;
  archivedAt?: Date | null;
};

export type UserProfileUpdateInput = Partial<
  Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>
>;

export interface Product extends EntityTimestamps {
  id: DocumentId;
  name: string;
  description?: string;
  category?: string;
  tags: string[];
  barcode?: string | null;
  isActive: boolean;
}

export type ProductCreateInput = {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  barcode?: string | null;
  isActive?: boolean;
  archivedAt?: Date | null;
};

export type ProductUpdateInput = Partial<
  Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
> & {
  archivedAt?: Date | null;
};

export interface RecipeIngredient {
  referenceId: DocumentId;
  type: 'product' | 'recipe';
  quantityInGrams: number;
}

export interface Recipe extends EntityTimestamps {
  id: DocumentId;
  name: string;
  description?: string;
  yieldInGrams: number;
  ingredients: RecipeIngredient[];
  instructions?: string;
  isActive: boolean;
}

export type RecipeCreateInput = {
  name: string;
  description?: string;
  yieldInGrams: number;
  ingredients?: RecipeIngredient[];
  instructions?: string;
  isActive?: boolean;
  archivedAt?: Date | null;
};

export type RecipeUpdateInput = Partial<
  Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>
> & {
  archivedAt?: Date | null;
};

export interface StockItem extends EntityTimestamps {
  id: DocumentId;
  productId: DocumentId;
  currentQuantityInGrams: number;
  minimumQuantityInGrams: number;
  lastMovementId?: DocumentId | null;
  highestUnitCostInBRL?: number;
  averageUnitCostInBRL?: number;
}

export type StockItemCreateInput = {
  productId: DocumentId;
  currentQuantityInGrams?: number;
  minimumQuantityInGrams: number;
  lastMovementId?: DocumentId | null;
  archivedAt?: Date | null;
  highestUnitCostInBRL?: number;
  averageUnitCostInBRL?: number;
};

export type StockItemUpdateInput = Partial<
  Omit<StockItem, 'id' | 'createdAt' | 'updatedAt'>
> & {
  archivedAt?: Date | null;
};

export type StockMovementType = 'increment' | 'decrement' | 'adjustment' | 'initial';

export interface StockMovement {
  id: DocumentId;
  productId: DocumentId;
  stockItemId: DocumentId;
  type: StockMovementType;
  quantityInGrams: number;
  previousQuantityInGrams: number;
  resultingQuantityInGrams: number;
  totalCostInBRL?: number;
  unitCostInBRL?: number;
  note?: string;
  performedBy: DocumentId;
  performedAt: Date;
}

export type StockMovementCreateInput = {
  productId: DocumentId;
  stockItemId: DocumentId;
  type: StockMovementType;
  quantityInGrams: number;
  previousQuantityInGrams: number;
  resultingQuantityInGrams: number;
  totalCostInBRL?: number;
  unitCostInBRL?: number;
  note?: string;
  performedBy: DocumentId;
  performedAt?: Date;
};

export type StockAlertSeverity = 'warning' | 'critical';

export type StockAlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface StockAlert extends EntityTimestamps {
  id: DocumentId;
  stockItemId: DocumentId;
  productId: DocumentId;
  status: StockAlertStatus;
  severity: StockAlertSeverity;
  currentQuantityInGrams: number;
  minimumQuantityInGrams: number;
  triggeredAt: Date;
  acknowledgedAt?: Date | null;
  resolvedAt?: Date | null;
  lastNotificationAt?: Date | null;
}

export type NotificationCategory = 'stock' | 'production';

export type NotificationStatus = 'unread' | 'read';

export interface AppNotification {
  id: DocumentId;
  title: string;
  message: string;
  category: NotificationCategory;
  type: string;
  referenceId?: DocumentId | null;
  status: NotificationStatus;
  createdAt: Date;
  readAt?: Date | null;
}

export type AppNotificationCreateInput = {
  title: string;
  message: string;
  category: NotificationCategory;
  type: string;
  referenceId?: DocumentId | null;
};

export type ProductionStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface ProductionPlan extends EntityTimestamps {
  id: DocumentId;
  recipeId: DocumentId;
  recipeName: string;
  sequenceNumber: number;
  code: string;
  scheduledFor: Date;
  quantityInUnits: number;
  unitOfMeasure: UnitOfMeasure;
  notes?: string;
  status: ProductionStatus;
  requestedBy: DocumentId;
  startedAt?: Date | null;
  completedAt?: Date | null;
  actualQuantityInUnits?: number | null;
  estimatedProductionCostInBRL?: number | null;
  actualProductionCostInBRL?: number | null;
  archivedAt?: Date | null;
}

export type ProductionPlanCreateInput = {
  recipeId: DocumentId;
  recipeName: string;
  scheduledFor: Date;
  quantityInUnits: number;
  unitOfMeasure: UnitOfMeasure;
  notes?: string;
  status?: ProductionStatus;
  requestedBy: DocumentId;
  startedAt?: Date | null;
  completedAt?: Date | null;
  actualQuantityInUnits?: number | null;
  estimatedProductionCostInBRL?: number | null;
  actualProductionCostInBRL?: number | null;
  archivedAt?: Date | null;
  sequenceNumber?: number;
  code?: string;
};

export type ProductionPlanUpdateInput = Partial<
  Omit<ProductionPlan, 'id' | 'createdAt' | 'updatedAt' | 'requestedBy'>
> & {
  archivedAt?: Date | null;
};

export type ProductionStageStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled';

export interface ProductionStage extends EntityTimestamps {
  id: DocumentId;
  planId: DocumentId;
  name: string;
  description?: string;
  sequence: number;
  status: ProductionStageStatus;
  assignedTo?: DocumentId | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  notes?: string;
}

export type ProductionStageCreateInput = {
  planId: DocumentId;
  name: string;
  description?: string;
  sequence: number;
  status?: ProductionStageStatus;
  assignedTo?: DocumentId | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  notes?: string;
};

export type ProductionStageUpdateInput = Partial<
  Omit<ProductionStage, 'id' | 'planId' | 'createdAt' | 'updatedAt'>
>;

export type ProductionDivergenceSeverity = 'low' | 'medium' | 'high';

export type ProductionDivergenceStatus = 'open' | 'investigating' | 'resolved';

export type ProductionDivergenceType =
  | 'ingredient_shortage'
  | 'equipment_issue'
  | 'quality_issue'
  | 'temperature_deviation'
  | 'other';

export interface ProductionDivergence extends EntityTimestamps {
  id: DocumentId;
  planId: DocumentId;
  stageId?: DocumentId | null;
  reportedBy: DocumentId;
  resolvedBy?: DocumentId | null;
  status: ProductionDivergenceStatus;
  severity: ProductionDivergenceSeverity;
  type: ProductionDivergenceType;
  description: string;
  expectedQuantityInUnits?: number | null;
  actualQuantityInUnits?: number | null;
  resolutionNotes?: string;
  resolvedAt?: Date | null;
}

export type ProductionDivergenceCreateInput = {
  planId: DocumentId;
  stageId?: DocumentId | null;
  reportedBy: DocumentId;
  severity: ProductionDivergenceSeverity;
  type: ProductionDivergenceType;
  description: string;
  expectedQuantityInUnits?: number | null;
  actualQuantityInUnits?: number | null;
};

export type ProductionDivergenceUpdateInput = Partial<
  Omit<ProductionDivergence, 'id' | 'planId' | 'reportedBy' | 'createdAt' | 'updatedAt'>
> & {
  resolvedBy?: DocumentId | null;
  resolvedAt?: Date | null;
};

export interface IngredientAvailability {
  productId: DocumentId;
  requiredQuantityInGrams: number;
  availableQuantityInGrams: number;
  shortageInGrams: number;
  minimumQuantityInGrams?: number;
  averageUnitCostInBRL?: number | null;
  estimatedCostInBRL?: number | null;
}

export type ProductionPlanAvailabilityStatus =
  | 'sufficient'
  | 'insufficient'
  | 'fulfilled'
  | 'reconciled';

export interface ProductionPlanAvailabilityRecord extends EntityTimestamps {
  id: DocumentId;
  planId: DocumentId;
  planCode: string;
  recipeId: DocumentId;
  recipeName: string;
  scheduledFor: Date;
  quantityInUnits: number;
  unitOfMeasure: UnitOfMeasure;
  status: ProductionPlanAvailabilityStatus;
  confirmedBy?: DocumentId | null;
  confirmedAt?: Date | null;
  shortages: IngredientAvailability[];
  totalRequiredInGrams: number;
  totalAvailableInGrams: number;
  totalShortageInGrams: number;
  notes?: string | null;
  executionStartedAt?: Date | null;
  executionCompletedAt?: Date | null;
  actualConsumedInGrams?: number | null;
  actualShortageInGrams?: number | null;
  estimatedCostInBRL?: number | null;
  actualCostInBRL?: number | null;
}

export type ProductionPlanAvailabilityRecordCreateInput = Omit<
  ProductionPlanAvailabilityRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export interface PricingSettings extends EntityTimestamps {
  id: DocumentId;
  sellingPricePer100gInBRL: number;
  sellingPricePerKilogramInBRL: number;
  updatedBy?: DocumentId | null;
}

export type PricingSettingsUpdateInput = Partial<
  Omit<PricingSettings, 'id' | 'createdAt' | 'updatedAt'>
>;
