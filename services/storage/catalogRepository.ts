import { storageService as legacy } from '../storage.legacy.ts';

export const catalogRepository = {
  findWineInCatalog: legacy.findWineInCatalog,
};
