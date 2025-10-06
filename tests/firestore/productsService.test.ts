jest.mock('firebase/firestore', () => jest.requireActual('../mocks/firebaseFirestore'));

jest.mock('@/services/firebase', () => ({
  getFirestoreDb: jest.fn(),
}));

jest.mock('@/services/firestore/stockService', () => ({
  listStockItems: jest.fn(),
  deleteStockItem: jest.fn(),
  recordStockMovement: jest.fn(),
}));

import { getFirestoreDb } from '@/services/firebase';
import {
  archiveProduct,
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  restoreProduct,
  subscribeToProduct,
  subscribeToProducts,
  updateProduct,
} from '@/services/firestore/productsService';
import {
  deleteStockItem,
  listStockItems,
  recordStockMovement,
} from '@/services/firestore/stockService';
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
  Timestamp,
  updateDoc,
} from '../mocks/firebaseFirestore';
import type { Firestore } from 'firebase/firestore';

describe('productsService', () => {
  const mockDb = { __type: 'db' } as unknown as Firestore;

  beforeEach(() => {
    resetFirestoreMocks();
    (getFirestoreDb as jest.Mock).mockReturnValue(mockDb);
    jest.clearAllMocks();
    (listStockItems as jest.Mock).mockResolvedValue([]);
    (deleteStockItem as jest.Mock).mockResolvedValue(undefined);
    (recordStockMovement as jest.Mock).mockResolvedValue(undefined);
  });

  it('lists active products by default', async () => {
    const createdAt = createTimestamp(new Date('2024-01-01T00:00:00Z'));
    const updatedAt = createTimestamp(new Date('2024-01-02T00:00:00Z'));

    (getDocs as jest.Mock).mockResolvedValueOnce({
      docs: [
        createSnapshot('prod-1', {
          name: 'Sorvete de Chocolate',
          barcode: '789123',
          tags: ['popular'],
          isActive: true,
          createdAt,
          updatedAt,
        }),
      ],
    });

    const products = await listProducts();

    const [, ...constraints] = (query as jest.Mock).mock.calls[0];
    expect(constraints).toHaveLength(2);
    expect(constraints[0]).toMatchObject({ field: 'isActive', op: '==', value: true });
    expect(constraints[1]).toMatchObject({ field: 'name', direction: 'asc' });
    expect(products).toEqual([
      expect.objectContaining({
        id: 'prod-1',
        name: 'Sorvete de Chocolate',
        tags: ['popular'],
        isActive: true,
      }),
    ]);
  });

  it('allows including inactive products', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({ docs: [] });

    await listProducts({ includeInactive: true });

    const [, ...constraints] = (query as jest.Mock).mock.calls[0];
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({ field: 'name', direction: 'asc' });
  });

  it('reads a single product document', async () => {
    const createdAt = createTimestamp(new Date('2024-01-01T00:00:00Z'));
    const updatedAt = createTimestamp(new Date('2024-01-02T00:00:00Z'));

    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('prod-9', {
        name: 'Pistache',
        barcode: '789321',
        tags: [],
        isActive: true,
        createdAt,
        updatedAt,
      }),
    );

    const product = await getProductById('prod-9');

    expect(getDoc).toHaveBeenCalledTimes(1);
    expect(product).toMatchObject({ id: 'prod-9', name: 'Pistache' });
  });

  it('throws when a product document is missing', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(createSnapshot('missing', undefined));

    await expect(getProductById('missing')).rejects.toThrow(
      'Produto missing não encontrado.',
    );
  });

  it('creates a product with sensible defaults', async () => {
    (addDoc as jest.Mock).mockResolvedValueOnce({ id: 'prod-new' });
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('prod-new', {
        name: 'Morango',
        barcode: '123456789',
        tags: [],
        isActive: true,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
      }),
    );

    const product = await createProduct({
      name: 'Morango',
      barcode: '123456789',
    });

    const addPayload = (addDoc as jest.Mock).mock.calls[0][1];
    const timestampValue = (serverTimestamp as jest.Mock).mock.results[0]?.value;
    expect(addPayload).toMatchObject({
      name: 'Morango',
      barcode: '123456789',
      tags: [],
      isActive: true,
      archivedAt: null,
    });
    expect(addPayload.createdAt).toBe(timestampValue);
    expect(addPayload.updatedAt).toBe(timestampValue);
    expect(product).toMatchObject({ id: 'prod-new', name: 'Morango' });
  });

  it('updates a product and re-fetches it', async () => {
    const archivedAt = new Date('2023-05-01T00:00:00Z');

    const createdAt = createTimestamp(new Date());
    const previousUpdatedAt = createTimestamp(new Date('2024-05-01T00:00:00Z'));
    const nextUpdatedAt = createTimestamp(new Date('2024-05-02T00:00:00Z'));

    (getDoc as jest.Mock)
      .mockResolvedValueOnce(
        createSnapshot('prod-5', {
          name: 'Baunilha',
          barcode: 'BR-1010',
          tags: [],
          isActive: true,
          createdAt,
          updatedAt: previousUpdatedAt,
        }),
      )
      .mockResolvedValueOnce(
        createSnapshot('prod-5', {
          name: 'Baunilha Premium',
          barcode: 'BR-1010',
          tags: [],
          isActive: true,
          createdAt,
          updatedAt: nextUpdatedAt,
          archivedAt: Timestamp.fromDate(new Date('2023-05-01T00:00:00Z')),
        }),
      );

    const product = await updateProduct('prod-5', {
      name: 'Baunilha Premium',
      archivedAt,
    });
    const updatePayload = (updateDoc as jest.Mock).mock.calls[0][1];
    const updatedAtStamp = (serverTimestamp as jest.Mock).mock.results.at(-1)?.value;
    expect(updatePayload.name).toBe('Baunilha Premium');
    expect(updatePayload.archivedAt?.toDate()).toEqual(archivedAt);
    expect(updatePayload.updatedAt).toBe(updatedAtStamp);
    expect(Timestamp.fromDate).toHaveBeenCalledWith(archivedAt);
    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(product).toMatchObject({ name: 'Baunilha Premium' });
  });

  it('archives a product', async () => {
    const createdAt = createTimestamp(new Date());
    const previousUpdatedAt = createTimestamp(new Date('2024-01-01T00:00:00Z'));
    const archivedAt = createTimestamp(new Date('2024-01-03T00:00:00Z'));

    (getDoc as jest.Mock)
      .mockResolvedValueOnce(
        createSnapshot('prod-archive', {
          name: 'Limão',
          barcode: null,
          tags: [],
          isActive: true,
          createdAt,
          updatedAt: previousUpdatedAt,
          archivedAt: null,
        }),
      )
      .mockResolvedValueOnce(
        createSnapshot('prod-archive', {
          name: 'Limão',
          barcode: null,
          tags: [],
          isActive: false,
          createdAt,
          updatedAt: archivedAt,
          archivedAt,
        }),
      );

    await archiveProduct('prod-archive');

    const updatePayload = (updateDoc as jest.Mock).mock.calls[0][1];
    const [archivedAtStamp, updatedAtStamp] = (
      serverTimestamp as jest.Mock
    ).mock.results.map(result => result.value);
    expect(updatePayload.isActive).toBe(false);
    expect(updatePayload.archivedAt).toBe(archivedAtStamp);
    expect(updatePayload.updatedAt).toBe(updatedAtStamp);
  });

  it('restores a product', async () => {
    const createdAt = createTimestamp(new Date());
    const archivedAt = createTimestamp(new Date('2024-02-01T00:00:00Z'));
    const restoredAt = createTimestamp(new Date('2024-02-05T00:00:00Z'));

    (getDoc as jest.Mock)
      .mockResolvedValueOnce(
        createSnapshot('prod-restore', {
          name: 'Ameixa',
          barcode: 'AME123',
          tags: [],
          isActive: false,
          createdAt,
          updatedAt: archivedAt,
          archivedAt,
        }),
      )
      .mockResolvedValueOnce(
        createSnapshot('prod-restore', {
          name: 'Ameixa',
          barcode: 'AME123',
          tags: [],
          isActive: true,
          createdAt,
          updatedAt: restoredAt,
          archivedAt: null,
        }),
      );

    await restoreProduct('prod-restore');

    const updatePayload = (updateDoc as jest.Mock).mock.calls[0][1];
    const updatedAtStamp = (serverTimestamp as jest.Mock).mock.results.at(-1)?.value;
    expect(updatePayload).toMatchObject({ isActive: true, archivedAt: null });
    expect(updatePayload.updatedAt).toBe(updatedAtStamp);
  });

  it('deletes a product without stock leftovers', async () => {
    await deleteProduct('prod-delete');

    expect(listStockItems).toHaveBeenCalledWith({
      productId: 'prod-delete',
      includeArchived: true,
    });
    expect(deleteStockItem).not.toHaveBeenCalled();
    expect(recordStockMovement).not.toHaveBeenCalled();
    expect(deleteDoc).toHaveBeenCalledWith(expect.anything());
  });

  it('removes stock items and records adjustment when deleting a product with inventory', async () => {
    (listStockItems as jest.Mock).mockResolvedValueOnce([
      {
        id: 'stock-1',
        productId: 'prod-keep',
        currentQuantityInGrams: 1250,
        minimumQuantityInGrams: 200,
        lastMovementId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      },
    ]);

    await deleteProduct('prod-keep', {
      performedBy: 'user-1',
      reason: 'Cleanup test',
    });

    expect(recordStockMovement).toHaveBeenCalledWith({
      productId: 'prod-keep',
      stockItemId: 'stock-1',
      type: 'adjustment',
      quantityInGrams: 1250,
      previousQuantityInGrams: 1250,
      resultingQuantityInGrams: 0,
      note: 'Cleanup test',
      performedBy: 'user-1',
      performedAt: expect.any(Date),
    });
    expect(deleteStockItem).toHaveBeenCalledWith('stock-1');
    expect(deleteDoc).toHaveBeenCalledWith(expect.anything());
  });

  it('subscribes to product list updates', () => {
    const next = jest.fn();
    const error = jest.fn();

    (onSnapshot as jest.Mock).mockImplementationOnce((_ref, onNext, _onError) => {
      onNext({
        docs: [
          createSnapshot('prod-1', {
            name: 'Lista',
            barcode: '111',
            tags: [],
            isActive: true,
            createdAt: createTimestamp(new Date()),
            updatedAt: createTimestamp(new Date()),
          }),
        ],
      });
      return () => {};
    });

    const unsubscribe = subscribeToProducts({ next, error });

    expect(onSnapshot).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'prod-1', name: 'Lista' }),
    ]);

    unsubscribe();
  });

  it('subscribes to a single product', () => {
    const next = jest.fn();
    const error = jest.fn();

    (onSnapshot as jest.Mock).mockImplementationOnce((_ref, onNext, _onError) => {
      onNext(
        createSnapshot('prod-single', {
          name: 'Single',
          barcode: null,
          tags: [],
          isActive: true,
          createdAt: createTimestamp(new Date()),
          updatedAt: createTimestamp(new Date()),
        }),
      );
      return () => {};
    });

    const unsubscribe = subscribeToProduct('prod-single', { next, error });

    expect(onSnapshot).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'prod-single', name: 'Single' }),
    );

    unsubscribe();
  });
});
