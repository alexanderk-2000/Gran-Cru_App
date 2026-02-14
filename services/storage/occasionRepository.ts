import { storageService as legacy } from '../storage.legacy.ts';

export const occasionRepository = {
  getOccasions: legacy.getOccasions,
  getOccasionInstances: legacy.getOccasionInstances,
  getOccasionInstancesByOccasion: legacy.getOccasionInstancesByOccasion,
  getOccasionWinePool: legacy.getOccasionWinePool,
  saveOccasionWinePool: legacy.saveOccasionWinePool,
  updateInstanceWine: legacy.updateInstanceWine,
  updateInstanceStatus: legacy.updateInstanceStatus,
  applyAutoAssignments: legacy.applyAutoAssignments,
  clearAutoAssignmentsForOccasion: legacy.clearAutoAssignmentsForOccasion,
  saveOccasion: legacy.saveOccasion,
  deleteOccasion: legacy.deleteOccasion,
  syncInstances: legacy.syncInstances,
  generateDates: legacy.generateDates,
};
