import type { Firestore } from 'firebase/firestore';

jest.mock('firebase/firestore', () => require('../mocks/firebaseFirestore'));

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
import { getFirestoreDb } from '@/services/firebase';
import { createNotification } from '@/services/firestore/notificationsService';
import { getStockAlertDocumentForItem } from '@/services/firestore/stockAlertsService';
import { logError } from '@/utils/logger';
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

describe('stockService', () => {
  const mockDb = { __type: 'db' } as unknown as Firestore;

  beforeEach(() => {
    resetFirestoreMocks();
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
    expect(constraints[0]).toMatchObject({ field: 'productId', op: '==', value: 'prod-2' });
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
    });
    expect(payload.createdAt).toBe(timestampValue);
    expect(payload.updatedAt).toBe(timestampValue);
  });

  it('updates a stock item', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('stock-4', {
        productId: 'prod-4',
        currentQuantityInGrams: 120,
        minimumQuantityInGrams: 80,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
      }),
    );

    await updateStockItem('stock-4', { currentQuantityInGrams: 140 });

    const payload = (updateDoc as jest.Mock).mock.calls[0][1];
    const updatedAtStamp = (serverTimestamp as jest.Mock).mock.results.at(-1)?.value;

    expect(payload).toMatchObject({ currentQuantityInGrams: 140 });
    expect(payload.updatedAt).toBe(updatedAtStamp);
  });

  it('archives a stock item', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('stock-5', {
        productId: 'prod-5',
        currentQuantityInGrams: 70,
        minimumQuantityInGrams: 40,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
      }),
    );

    await archiveStockItem('stock-5');

    const [archivedAtStamp, updatedAtStamp] = (serverTimestamp as jest.Mock).mock.results.map(
      result => result.value,
    );
    const payload = (updateDoc as jest.Mock).mock.calls[0][1];
    expect(payload.archivedAt).toBe(archivedAtStamp);
    expect(payload.updatedAt).toBe(updatedAtStamp);
  });

  it('restores a stock item', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('stock-5', {
        productId: 'prod-5',
        currentQuantityInGrams: 70,
        minimumQuantityInGrams: 40,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
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
    expect(constraints[0]).toMatchObject({ field: 'productId', op: '==', value: 'prod-1' });
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
    });

    const alertSnapshot = createSnapshot('alert-1', {
      status: 'open',
      severity: 'warning',
      currentQuantityInGrams: 30,
      minimumQuantityInGrams: 50,
    });

    (transactionGet as jest.Mock)
      .mockResolvedValueOnce(itemSnapshot)
      .mockResolvedValueOnce(alertSnapshot);

    const movementSnapshot = createSnapshot('movement-123', {
      productId: 'prod-1',
      stockItemId: 'stock-1',
      type: 'increment',
      quantityInGrams: 10,
      previousQuantityInGrams: 100,
      resultingQuantityInGrams: 110,
      performedBy: 'tester',
      performedAt: createTimestamp(new Date()),
    });

    (getDoc as jest.Mock).mockResolvedValueOnce(movementSnapshot);

    const result = await adjustStockLevel({
      stockItemId: 'stock-1',
      quantityInGrams: 10,
      type: 'increment',
      performedBy: 'tester',
    });

    expect(result).toMatchObject({ id: 'movement-123', resultingQuantityInGrams: 110 });
    expect(transactionUpdate).toHaveBeenCalled();
    expect(transactionUpdate.mock.calls[0][1]).toMatchObject({
      currentQuantityInGrams: 110,
      lastMovementId: expect.any(String),
    });
    expect(transactionSet).toHaveBeenCalled();
    expect(transactionSet.mock.calls[0][1]).toMatchObject({ resultingQuantityInGrams: 110 });
    expect(
      transactionUpdate.mock.calls.some(([
        ref,
        payload,
      ]: [any, Record<string, unknown>]) => ref?.id === 'alert-ref' && payload.status === 'resolved'),
    ).toBe(true);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('adjusts stock level below minimum and creates notification', async () => {
    const itemSnapshot = createSnapshot('stock-1', {
      productId: 'prod-1',
      currentQuantityInGrams: 60,
      minimumQuantityInGrams: 80,
    });

    (transactionGet as jest.Mock)
      .mockResolvedValueOnce(itemSnapshot)
      .mockResolvedValueOnce(createSnapshot('alert-1', undefined));

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
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'stock',
        referenceId: 'stock-1',
      }),
    );
  });

  it('logs when notification creation fails', async () => {
    const itemSnapshot = createSnapshot('stock-1', {
      productId: 'prod-1',
      currentQuantityInGrams: 10,
      minimumQuantityInGrams: 20,
    });

    (transactionGet as jest.Mock)
      .mockResolvedValueOnce(itemSnapshot)
      .mockResolvedValueOnce(createSnapshot('alert-1', undefined));

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

    expect(logError).toHaveBeenCalledWith(expect.any(Error), 'stock.adjustStockLevel.notification');
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
        onNext({ docs: [
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
        ] });
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
