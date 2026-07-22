import { storageService as legacy } from '../storage.legacy.ts';

export const occasionRepository = {
  getOccasions: legacy.getOccasions,
  getOccasionsUpdatedSince: legacy.getOccasionsUpdatedSince,
  getOccasionInstances: legacy.getOccasionInstances,
  getOccasionInstancesUpdatedSince: legacy.getOccasionInstancesUpdatedSince,
  getOccasionInstancesByOccasion: legacy.getOccasionInstancesByOccasion,
  getOccasionWinePool: legacy.getOccasionWinePool,
  getOccasionWinePoolUpdatedSince: legacy.getOccasionWinePoolUpdatedSince,
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
