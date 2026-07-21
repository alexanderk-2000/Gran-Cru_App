import { storageService as legacy } from '../storage.legacy.ts';

export const wineRepository = {
  getWines: legacy.getWines,
  getWineById: legacy.getWineById,
  saveWine: legacy.saveWine,
  adjustStock: legacy.adjustStock,
  recordPurchase: legacy.recordPurchase,
  recordLoss: legacy.recordLoss,
  transferWine: legacy.transferWine,
  consumeBottle: legacy.consumeBottle,
  softDeleteWine: legacy.softDeleteWine,
  getDeletedWines: legacy.getDeletedWines,
  restoreWine: legacy.restoreWine,
  permanentlyDeleteWine: legacy.permanentlyDeleteWine,
  emptyTrash: legacy.emptyTrash,
};
