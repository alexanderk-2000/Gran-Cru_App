import { storageService as legacy } from '../storage.legacy.ts';

export const inventoryEventsRepository = {
  getConsumptionHistory: legacy.getConsumptionHistory,
  getConsumptionHistorySince: legacy.getConsumptionHistorySince,
  getInventoryEvents: legacy.getInventoryEvents,
};
