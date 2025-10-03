export type DocumentId = string;

export type UnitOfMeasure = 'GRAMS' | 'MILLILITERS' | 'UNITS';

export interface EntityTimestamps {
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

export interface Product extends EntityTimestamps {
  id: DocumentId;
  name: string;
  description?: string;
  category?: string;
  unitWeightInGrams: number;
  pricePerGram: number;
  tags: string[];
  isActive: boolean;
}

export type ProductCreateInput = {
  name: string;
  description?: string;
  category?: string;
  unitWeightInGrams: number;
  pricePerGram: number;
  tags?: string[];
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
}

export type StockItemCreateInput = {
  productId: DocumentId;
  currentQuantityInGrams?: number;
  minimumQuantityInGrams: number;
  lastMovementId?: DocumentId | null;
  archivedAt?: Date | null;
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
  scheduledFor: Date;
  quantityInUnits: number;
  unitOfMeasure: UnitOfMeasure;
  notes?: string;
  status: ProductionStatus;
  requestedBy: DocumentId;
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
  archivedAt?: Date | null;
};

export type ProductionPlanUpdateInput = Partial<
  Omit<ProductionPlan, 'id' | 'createdAt' | 'updatedAt' | 'requestedBy'>
> & {
  archivedAt?: Date | null;
};
