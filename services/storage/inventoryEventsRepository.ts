import { storageService as legacy } from '../storage.legacy.ts';

export const inventoryEventsRepository = {
  getConsumptionHistory: legacy.getConsumptionHistory,
};
