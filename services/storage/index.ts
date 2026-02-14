import { getItem, removeItem, setItem, storageService as legacy } from '../storage.legacy.ts';
import { authRepository } from './authRepository.ts';
import { catalogRepository } from './catalogRepository.ts';
import { inventoryEventsRepository } from './inventoryEventsRepository.ts';
import { occasionRepository } from './occasionRepository.ts';
import { pocketRepository } from './pocketRepository.ts';
import { tastingRepository } from './tastingRepository.ts';
import { wineRepository } from './wineRepository.ts';
import { createStorageOfflineAdapter } from '../pwa/storageOfflineAdapter.ts';

export { getItem, removeItem, setItem };

const backendStorageService = {
  ...legacy,
  ...authRepository,
  ...wineRepository,
  ...catalogRepository,
  ...pocketRepository,
  ...occasionRepository,
  ...tastingRepository,
  ...inventoryEventsRepository,
};

export const storageService = createStorageOfflineAdapter(backendStorageService);
