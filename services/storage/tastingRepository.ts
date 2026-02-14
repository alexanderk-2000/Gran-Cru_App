import { storageService as legacy } from '../storage.legacy.ts';

export const tastingRepository = {
  getTastings: legacy.getTastings,
  addTasting: legacy.addTasting,
};
