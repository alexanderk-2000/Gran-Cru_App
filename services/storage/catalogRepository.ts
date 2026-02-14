import { storageService as legacy } from '../storage.legacy.ts';

export const catalogRepository = {
  upsertWineCatalog: legacy.upsertWineCatalog,
  findWineInCatalog: legacy.findWineInCatalog,
};
