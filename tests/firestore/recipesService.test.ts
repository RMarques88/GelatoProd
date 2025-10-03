import type { Firestore } from 'firebase/firestore';

jest.mock('firebase/firestore', () => require('../mocks/firebaseFirestore'));

jest.mock('@/services/firebase', () => ({
  getFirestoreDb: jest.fn(),
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
  Timestamp,
  updateDoc,
} from '../mocks/firebaseFirestore';
import { getFirestoreDb } from '@/services/firebase';
import {
  archiveRecipe,
  createRecipe,
  deleteRecipe,
  getRecipeById,
  listRecipes,
  restoreRecipe,
  subscribeToRecipe,
  subscribeToRecipes,
  updateRecipe,
} from '@/services/firestore/recipesService';

describe('recipesService', () => {
  const mockDb = { __type: 'db' } as unknown as Firestore;

  beforeEach(() => {
    resetFirestoreMocks();
    (getFirestoreDb as jest.Mock).mockReturnValue(mockDb);
  });

  it('lists active recipes by default', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({
      docs: [
        createSnapshot('recipe-1', {
          name: 'Base de Creme',
          yieldInGrams: 500,
          ingredients: [],
          isActive: true,
          createdAt: createTimestamp(new Date()),
          updatedAt: createTimestamp(new Date()),
        }),
      ],
    });

    await listRecipes();

    const [, ...constraints] = (query as jest.Mock).mock.calls[0];
    expect(constraints).toHaveLength(2);
    expect(constraints[0]).toMatchObject({ field: 'isActive', op: '==', value: true });
    expect(constraints[1]).toMatchObject({ field: 'name', direction: 'asc' });
  });

  it('includes inactive recipes when requested', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({ docs: [] });

    await listRecipes({ includeInactive: true });

    const [, ...constraints] = (query as jest.Mock).mock.calls[0];
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({ field: 'name', direction: 'asc' });
  });

  it('fetches a recipe by id', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('recipe-5', {
        name: 'Cobertura de Chocolate',
        yieldInGrams: 300,
        ingredients: [],
        isActive: true,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
      }),
    );

    const recipe = await getRecipeById('recipe-5');

    expect(recipe).toMatchObject({ id: 'recipe-5', name: 'Cobertura de Chocolate' });
  });

  it('throws when recipe snapshot is missing', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(createSnapshot('missing', undefined));

    await expect(getRecipeById('missing')).rejects.toThrow('Receita missing não encontrada.');
  });

  it('creates a recipe with default values', async () => {
    (addDoc as jest.Mock).mockResolvedValueOnce({ id: 'recipe-new' });
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('recipe-new', {
        name: 'Calda de Morango',
        yieldInGrams: 200,
        ingredients: [],
        isActive: true,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
      }),
    );

    await createRecipe({ name: 'Calda de Morango', yieldInGrams: 200 });

    const payload = (addDoc as jest.Mock).mock.calls[0][1];
    const timestampValue = (serverTimestamp as jest.Mock).mock.results[0]?.value;

    expect(payload).toMatchObject({
      name: 'Calda de Morango',
      yieldInGrams: 200,
      ingredients: [],
      isActive: true,
      archivedAt: null,
    });
    expect(payload.createdAt).toBe(timestampValue);
    expect(payload.updatedAt).toBe(timestampValue);
  });

  it('updates a recipe', async () => {
    const archivedAt = new Date('2023-04-01T00:00:00Z');

    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('recipe-7', {
        name: 'Ganache',
        yieldInGrams: 150,
        ingredients: [],
        isActive: true,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
      }),
    );

    await updateRecipe('recipe-7', { name: 'Ganache Escura', archivedAt });

    const payload = (updateDoc as jest.Mock).mock.calls[0][1];
    const updatedAtStamp = (serverTimestamp as jest.Mock).mock.results.at(-1)?.value;

    expect(payload.name).toBe('Ganache Escura');
    expect(payload.archivedAt?.toDate()).toEqual(archivedAt);
    expect(payload.updatedAt).toBe(updatedAtStamp);
    expect(Timestamp.fromDate).toHaveBeenCalledWith(archivedAt);
  });

  it('archives a recipe', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('recipe-8', {
        name: 'Cobertura de Caramelo',
        yieldInGrams: 250,
        ingredients: [],
        isActive: false,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
      }),
    );

    await archiveRecipe('recipe-8');

    const payload = (updateDoc as jest.Mock).mock.calls[0][1];
    const [archivedAtStamp, updatedAtStamp] = (serverTimestamp as jest.Mock).mock.results.map(
      result => result.value,
    );
    expect(payload.isActive).toBe(false);
    expect(payload.archivedAt).toBe(archivedAtStamp);
    expect(payload.updatedAt).toBe(updatedAtStamp);
  });

  it('restores a recipe', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(
      createSnapshot('recipe-restore', {
        name: 'Cobertura de Limão',
        yieldInGrams: 120,
        ingredients: [],
        isActive: true,
        createdAt: createTimestamp(new Date()),
        updatedAt: createTimestamp(new Date()),
      }),
    );

    await restoreRecipe('recipe-restore');

    const payload = (updateDoc as jest.Mock).mock.calls[0][1];
    const updatedAtStamp = (serverTimestamp as jest.Mock).mock.results.at(-1)?.value;
    expect(payload).toMatchObject({ isActive: true, archivedAt: null });
    expect(payload.updatedAt).toBe(updatedAtStamp);
  });

  it('deletes a recipe', async () => {
    await deleteRecipe('recipe-del');
    expect(deleteDoc).toHaveBeenCalledWith(expect.anything());
  });

  it('subscribes to recipes', () => {
    const next = jest.fn();

    (onSnapshot as jest.Mock).mockImplementationOnce((_ref, onNext) => {
      onNext({
        docs: [
          createSnapshot('recipe-1', {
            name: 'Cobertura',
            yieldInGrams: 100,
            ingredients: [],
            isActive: true,
            createdAt: createTimestamp(new Date()),
            updatedAt: createTimestamp(new Date()),
          }),
        ],
      });
      return () => {};
    });

    const unsubscribe = subscribeToRecipes({ next });

    expect(next).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'recipe-1', name: 'Cobertura' }),
    ]);

    unsubscribe();
  });

  it('subscribes to a single recipe', () => {
    const next = jest.fn();

    (onSnapshot as jest.Mock).mockImplementationOnce((_ref, onNext) => {
      onNext(
        createSnapshot('recipe-single', {
          name: 'Cobertura',
          yieldInGrams: 100,
          ingredients: [],
          isActive: true,
          createdAt: createTimestamp(new Date()),
          updatedAt: createTimestamp(new Date()),
        }),
      );
      return () => {};
    });

    const unsubscribe = subscribeToRecipe('recipe-single', { next });

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'recipe-single', name: 'Cobertura' }),
    );

    unsubscribe();
  });
});
