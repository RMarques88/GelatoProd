jest.mock('firebase/firestore', () => jest.requireActual('../mocks/firebaseFirestore'));

jest.mock('@/services/firebase', () => ({
  getFirestoreDb: jest.fn(),
}));

jest.mock('@/services/firestore/notificationsService', () => ({
  createNotification: jest.fn(),
}));

jest.mock('@/services/firestore/stockAlertsService', () => ({
  getStockAlertDocumentForItem: jest.fn(() => ({ id: 'alert-ref' })),
}));

jest.mock('@/utils/logger', () => ({
  logError: jest.fn(),
}));

import { getFirestoreDb } from '@/services/firebase';
import { createNotification } from '@/services/firestore/notificationsService';
import { getStockAlertDocumentForItem } from '@/services/firestore/stockAlertsService';
import {
  adjustStockLevel,
  archiveStockItem,
  createStockItem,
  deleteStockItem,
  getStockItemById,
  listStockItems,
  listStockMovements,
  recordStockMovement,
  restoreStockItem,
  subscribeToStockItem,
  subscribeToStockItems,
  subscribeToStockMovements,
  updateStockItem,
} from '@/services/firestore/stockService';
import { logError } from '@/utils/logger';
import {
  addDoc,
  createSnapshot,
  createTimestamp,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  resetFirestoreMocks,
  serverTimestamp,
  transactionGet,
  transactionSet,
  transactionUpdate,
  updateDoc,
} from '../mocks/firebaseFirestore';
import type { Firestore } from 'firebase/firestore';

describe('stockService', () => {
  const mockDb = { __type: 'db' } as unknown as Firestore;

  beforeEach(() => {
    resetFirestoreMocks();
    (transactionGet as jest.Mock).mockReset();
    (transactionSet as jest.Mock).mockReset();
    (transactionUpdate as jest.Mock).mockReset();
    (getFirestoreDb as jest.Mock).mockReturnValue(mockDb);
    (createNotification as jest.Mock).mockResolvedValue(undefined);
    (getStockAlertDocumentForItem as jest.Mock).mockReturnValue({ id: 'alert-ref' });
  });

  it('lists stock items excluding archived by default', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({
      docs: [
        createSnapshot('stock-1', {
          productId: 'prod-1',
          currentQuantityInGrams: 500,
          minimumQuantityInGrams: 100,
          lastMovementId: null,
          archivedAt: null,
          createdAt: createTimestamp(new Date()),
          updatedAt: createTimestamp(new Date()),
        }),
      ],
    });

    await listStockItems();
    const [, ...constraints] = (query as jest.Mock).mock.calls[0];
    expect(constraints).toHaveLength(2);
    expect(constraints[0]).toMatchObject({ field: 'archivedAt', op: '==', value: null });
    expect(constraints[1]).toMatchObject({ field: 'productId', direction: 'asc' });
  });

  it('filters stock items by product id when provided', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({ docs: [] });

    await listStockItems({ productId: 'prod-2', includeArchived: true });

    const [, ...constraints] = (query as jest.Mock).mock.calls[0];
    expect(constraints).toHaveLength(2);
    expect(constraints[0]).toMatchObject({
      field: 'productId',
      op: '==',
      value: 'prod-2',
    });
    expect(constraints[1]).toMatchObject({ field: 'productId', direction: 'asc' });
  });

  it('retrieves a stock item by id', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('stock-1', {
        productId: 'prod-1',
        currentQuantityInGrams: 200,
        minimumQuantityInGrams: 100,
        lastMovementId: null,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
      }),
    );

    const item = await getStockItemById('stock-1');

    expect(item).toMatchObject({ id: 'stock-1', productId: 'prod-1' });
  });

  it('throws when stock item snapshot is missing', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(createSnapshot('missing', undefined));

    await expect(getStockItemById('missing')).rejects.toThrow(
      'Item de estoque missing não encontrado.',
    );
  });

  it('creates a stock item with defaults', async () => {
    (addDoc as jest.Mock).mockResolvedValueOnce({ id: 'stock-new' });
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('stock-new', {
        productId: 'prod-3',
        currentQuantityInGrams: 0,
        minimumQuantityInGrams: 50,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
        averageUnitCostInBRL: 0,
      }),
    );

    await createStockItem({ productId: 'prod-3', minimumQuantityInGrams: 50 });

    const payload = (addDoc as jest.Mock).mock.calls[0][1];
    const timestampValue = (serverTimestamp as jest.Mock).mock.results[0]?.value;
    expect(payload).toMatchObject({
      productId: 'prod-3',
      minimumQuantityInGrams: 50,
      currentQuantityInGrams: 0,
      archivedAt: null,
      highestUnitCostInBRL: 0,
      averageUnitCostInBRL: 0,
    });
    expect(payload.createdAt).toBe(timestampValue);
    expect(payload.updatedAt).toBe(timestampValue);
  });

  it('updates a stock item', async () => {
    const createdAt = createTimestamp(new Date());
    const previousUpdatedAt = createTimestamp(new Date('2024-04-01T00:00:00Z'));
    const nextUpdatedAt = createTimestamp(new Date('2024-04-05T00:00:00Z'));

    (getDoc as jest.Mock)
      .mockResolvedValueOnce(
        createSnapshot('stock-4', {
          productId: 'prod-4',
          currentQuantityInGrams: 120,
          minimumQuantityInGrams: 80,
          createdAt,
          updatedAt: previousUpdatedAt,
          archivedAt: null,
        }),
      )
      .mockResolvedValueOnce(
        createSnapshot('stock-4', {
          productId: 'prod-4',
          currentQuantityInGrams: 140,
          minimumQuantityInGrams: 80,
          createdAt,
          updatedAt: nextUpdatedAt,
          archivedAt: null,
        }),
      );

    await updateStockItem('stock-4', { currentQuantityInGrams: 140 });

    const payload = (updateDoc as jest.Mock).mock.calls[0][1];
    const updatedAtStamp = (serverTimestamp as jest.Mock).mock.results.at(-1)?.value;

    expect(payload).toMatchObject({ currentQuantityInGrams: 140 });
    expect(payload.updatedAt).toBe(updatedAtStamp);
  });

  it('archives a stock item', async () => {
    const createdAt = createTimestamp(new Date());
    const previousUpdatedAt = createTimestamp(new Date('2024-02-01T00:00:00Z'));
    const archivedAt = createTimestamp(new Date('2024-02-03T00:00:00Z'));

    (getDoc as jest.Mock)
      .mockResolvedValueOnce(
        createSnapshot('stock-5', {
          productId: 'prod-5',
          currentQuantityInGrams: 70,
          minimumQuantityInGrams: 40,
          createdAt,
          updatedAt: previousUpdatedAt,
          archivedAt: null,
        }),
      )
      .mockResolvedValueOnce(
        createSnapshot('stock-5', {
          productId: 'prod-5',
          currentQuantityInGrams: 70,
          minimumQuantityInGrams: 40,
          createdAt,
          updatedAt: archivedAt,
          archivedAt,
        }),
      );

    await archiveStockItem('stock-5');

    const [archivedAtStamp, updatedAtStamp] = (
      serverTimestamp as jest.Mock
    ).mock.results.map(result => result.value);
    const payload = (updateDoc as jest.Mock).mock.calls[0][1];
    expect(payload.archivedAt).toBe(archivedAtStamp);
    expect(payload.updatedAt).toBe(updatedAtStamp);
  });

  it('restores a stock item', async () => {
    const createdAt = createTimestamp(new Date());
    const archivedAt = createTimestamp(new Date('2024-03-01T00:00:00Z'));
    const restoredAt = createTimestamp(new Date('2024-03-05T00:00:00Z'));

    (getDoc as jest.Mock)
      .mockResolvedValueOnce(
        createSnapshot('stock-5', {
          productId: 'prod-5',
          currentQuantityInGrams: 70,
          minimumQuantityInGrams: 40,
          createdAt,
          updatedAt: archivedAt,
          archivedAt,
        }),
      )
      .mockResolvedValueOnce(
        createSnapshot('stock-5', {
          productId: 'prod-5',
          currentQuantityInGrams: 70,
          minimumQuantityInGrams: 40,
          createdAt,
          updatedAt: restoredAt,
          archivedAt: null,
        }),
      );

    await restoreStockItem('stock-5');

    const payload = (updateDoc as jest.Mock).mock.calls[0][1];
    const updatedAtStamp = (serverTimestamp as jest.Mock).mock.results.at(-1)?.value;
    expect(payload).toMatchObject({ archivedAt: null });
    expect(payload.updatedAt).toBe(updatedAtStamp);
  });

  it('deletes a stock item', async () => {
    await deleteStockItem('stock-del');
    expect(deleteDoc).toHaveBeenCalledWith(expect.anything());
  });

  it('lists stock movements with limit', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({
      docs: [
        createSnapshot('move-1', {
          productId: 'prod-1',
          stockItemId: 'stock-1',
          type: 'increment',
          quantityInGrams: 50,
          previousQuantityInGrams: 100,
          resultingQuantityInGrams: 150,
          performedBy: 'user',
          performedAt: createTimestamp(new Date()),
        }),
      ],
    });

    await listStockMovements({ productId: 'prod-1', limit: 5 });

    const [, ...constraints] = (query as jest.Mock).mock.calls[0];
    expect(constraints).toHaveLength(3);
    expect(constraints[0]).toMatchObject({
      field: 'productId',
      op: '==',
      value: 'prod-1',
    });
    expect(constraints[1]).toMatchObject({ field: 'performedAt', direction: 'desc' });
    expect(constraints[2]).toMatchObject({ value: 5 });
  });

  it('records a stock movement using server timestamp when missing', async () => {
    (addDoc as jest.Mock).mockResolvedValueOnce({ id: 'movement-1' });
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('movement-1', {
        productId: 'prod-1',
        stockItemId: 'stock-1',
        type: 'increment',
        quantityInGrams: 50,
        previousQuantityInGrams: 100,
        resultingQuantityInGrams: 150,
        performedBy: 'user',
        performedAt: createTimestamp(new Date()),
      }),
    );

    await recordStockMovement({
      productId: 'prod-1',
      stockItemId: 'stock-1',
      type: 'increment',
      quantityInGrams: 50,
      previousQuantityInGrams: 100,
      resultingQuantityInGrams: 150,
      performedBy: 'user',
    });

    const payload = (addDoc as jest.Mock).mock.calls[0][1];
    const timestampValue = (serverTimestamp as jest.Mock).mock.results.at(-1)?.value;
    expect(payload.performedAt).toBe(timestampValue);
  });

  it('adjusts stock level and resolves existing alert when above minimum', async () => {
    const itemSnapshot = createSnapshot('stock-1', {
      productId: 'prod-1',
      currentQuantityInGrams: 100,
      minimumQuantityInGrams: 50,
      // Stored as R$ / kg in Firestore
      highestUnitCostInBRL: 2000,
      averageUnitCostInBRL: 2000,
    });

    const alertSnapshot = createSnapshot('alert-1', {
      status: 'open',
      severity: 'warning',
      currentQuantityInGrams: 30,
      minimumQuantityInGrams: 50,
    });

    (transactionGet as jest.Mock)
      .mockResolvedValueOnce(itemSnapshot)
      .mockResolvedValueOnce(alertSnapshot)
      .mockResolvedValueOnce(createSnapshot('prod-1', { name: 'Gelato Pistache' }));

    const movementSnapshot = createSnapshot('movement-123', {
      productId: 'prod-1',
      stockItemId: 'stock-1',
      type: 'increment',
      quantityInGrams: 10,
      previousQuantityInGrams: 100,
      resultingQuantityInGrams: 110,
      performedBy: 'tester',
      performedAt: createTimestamp(new Date()),
      totalCostInBRL: 25,
      // Recorded unit cost for the movement (R$ / kg)
      unitCostInBRL: 2500,
    });

    (getDoc as jest.Mock).mockResolvedValueOnce(movementSnapshot);

    const result = await adjustStockLevel({
      stockItemId: 'stock-1',
      quantityInGrams: 10,
      type: 'increment',
      performedBy: 'tester',
      totalCostInBRL: 25,
    });

    expect(result).toMatchObject({ id: 'movement-123', resultingQuantityInGrams: 110 });
    expect(transactionUpdate).toHaveBeenCalled();
    expect(transactionUpdate.mock.calls[0][1]).toMatchObject({
      currentQuantityInGrams: 110,
      lastMovementId: expect.any(String),
      // highestUnitCostInBRL stored as R$ / kg
      highestUnitCostInBRL: 2500,
      averageUnitCostInBRL: expect.any(Number),
    });
    const updatePayload = transactionUpdate.mock.calls[0][1] as Record<string, number>;
    // averageUnitCostInBRL stored as R$ / kg; expected computed average using exact math
    expect(updatePayload.averageUnitCostInBRL).toBeCloseTo(2045.4545454545455, 3);
    expect(transactionSet).toHaveBeenCalled();
    expect(transactionSet.mock.calls[0][1]).toMatchObject({
      resultingQuantityInGrams: 110,
      totalCostInBRL: 25,
      // unitCostInBRL persisted as R$ / kg
      unitCostInBRL: 2500,
    });
    expect(
      transactionUpdate.mock.calls.some(
        ([ref, payload]: [unknown, Record<string, unknown>]) =>
          (ref as { id?: unknown })?.id === 'alert-ref' && payload.status === 'resolved',
      ),
    ).toBe(true);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('adjusts stock level below minimum and creates notification', async () => {
    const itemSnapshot = createSnapshot('stock-1', {
      productId: 'prod-1',
      currentQuantityInGrams: 60,
      minimumQuantityInGrams: 80,
      // Stored as R$ / kg in Firestore
      averageUnitCostInBRL: 2000,
    });

    (transactionGet as jest.Mock)
      .mockResolvedValueOnce(itemSnapshot)
      .mockResolvedValueOnce(createSnapshot('alert-1', undefined))
      .mockResolvedValueOnce(createSnapshot('prod-1', { name: 'Gelato Pistache' }));

    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('movement-999', {
        productId: 'prod-1',
        stockItemId: 'stock-1',
        type: 'decrement',
        quantityInGrams: 30,
        previousQuantityInGrams: 60,
        resultingQuantityInGrams: 30,
        performedBy: 'tester',
        performedAt: createTimestamp(new Date()),
      }),
    );

    await adjustStockLevel({
      stockItemId: 'stock-1',
      quantityInGrams: 30,
      type: 'decrement',
      performedBy: 'tester',
    });

    expect(transactionUpdate).toHaveBeenCalled();
    expect(transactionSet).toHaveBeenCalled();
    const movementPayload = transactionSet.mock.calls[0][1] as Record<string, number>;
    expect(movementPayload.totalCostInBRL).toBeCloseTo(60, 3);
    // unitCostInBRL persisted as R$ / kg (previous average was 2000 R$/kg)
    expect(movementPayload.unitCostInBRL).toBeCloseTo(2000, 3);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'stock',
        referenceId: 'stock-1',
        message: expect.stringContaining('Gelato Pistache'),
      }),
    );
  });

  it('throws when total cost is missing for an increment', async () => {
    (transactionGet as jest.Mock)
      .mockResolvedValueOnce(
        createSnapshot('stock-1', {
          productId: 'prod-1',
          currentQuantityInGrams: 100,
          minimumQuantityInGrams: 50,
        }),
      )
      .mockResolvedValueOnce(createSnapshot('alert-1', undefined))
      .mockResolvedValueOnce(createSnapshot('prod-1', { name: 'Gelato Pistache' }));

    await expect(
      adjustStockLevel({
        stockItemId: 'stock-1',
        quantityInGrams: 10,
        type: 'increment',
        performedBy: 'tester',
      }),
    ).rejects.toThrow('Informe o valor total da compra para registrar a entrada.');
  });

  it('logs when notification creation fails', async () => {
    const itemSnapshot = createSnapshot('stock-1', {
      productId: 'prod-1',
      currentQuantityInGrams: 10,
      minimumQuantityInGrams: 20,
    });

    (transactionGet as jest.Mock)
      .mockResolvedValueOnce(itemSnapshot)
      .mockResolvedValueOnce(createSnapshot('alert-1', undefined))
      .mockResolvedValueOnce(createSnapshot('prod-1', { name: 'Gelato Pistache' }));

    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('movement-111', {
        productId: 'prod-1',
        stockItemId: 'stock-1',
        type: 'decrement',
        quantityInGrams: 5,
        previousQuantityInGrams: 10,
        resultingQuantityInGrams: 5,
        performedBy: 'tester',
        performedAt: createTimestamp(new Date()),
      }),
    );

    (createNotification as jest.Mock).mockRejectedValueOnce(new Error('push failed'));

    await adjustStockLevel({
      stockItemId: 'stock-1',
      quantityInGrams: 5,
      type: 'decrement',
      performedBy: 'tester',
    });

    expect(
      transactionSet.mock.calls.some(
        ([ref]: [unknown, Record<string, unknown>]) =>
          (ref as { id?: unknown })?.id === 'alert-ref',
      ),
    ).toBe(true);
    expect(createNotification).toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.any(Error),
      'stock.adjustStockLevel.notification',
    );
  });

  it('subscribes to stock items, item, and movements', () => {
    const stockItemSnapshot = createSnapshot('stock-1', {
      productId: 'prod-1',
      currentQuantityInGrams: 100,
      minimumQuantityInGrams: 50,
      createdAt: createTimestamp(new Date()),
      updatedAt: createTimestamp(new Date()),
    });

    (onSnapshot as jest.Mock)
      .mockImplementationOnce((_ref, onNext) => {
        onNext({ docs: [stockItemSnapshot] });
        return () => {};
      })
      .mockImplementationOnce((_ref, onNext) => {
        onNext(stockItemSnapshot);
        return () => {};
      })
      .mockImplementationOnce((_ref, onNext) => {
        onNext({
          docs: [
            createSnapshot('movement-1', {
              productId: 'prod-1',
              stockItemId: 'stock-1',
              type: 'increment',
              quantityInGrams: 20,
              previousQuantityInGrams: 80,
              resultingQuantityInGrams: 100,
              performedBy: 'tester',
              performedAt: createTimestamp(new Date()),
            }),
          ],
        });
        return () => {};
      });

    const listNext = jest.fn();
    const itemNext = jest.fn();
    const moveNext = jest.fn();

    const unsubs = [
      subscribeToStockItems({ next: listNext }),
      subscribeToStockItem('stock-1', { next: itemNext }),
      subscribeToStockMovements({ next: moveNext }),
    ];

    expect(listNext).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'stock-1', productId: 'prod-1' }),
    ]);
    expect(itemNext).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'stock-1', productId: 'prod-1' }),
    );
    expect(moveNext).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'movement-1', type: 'increment' }),
    ]);

    unsubs.forEach(unsub => unsub());
  });
});
