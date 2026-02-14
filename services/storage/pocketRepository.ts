import { storageService as legacy } from '../storage.legacy.ts';

export const pocketRepository = {
  getCellarPockets: legacy.getCellarPockets,
  createCellarPocket: legacy.createCellarPocket,
};
