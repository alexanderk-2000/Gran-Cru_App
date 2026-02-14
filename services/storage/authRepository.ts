import { storageService as legacy } from '../storage.legacy.ts';

export const authRepository = {
  getCurrentUser: legacy.getCurrentUser,
  logout: legacy.logout,
  signUp: legacy.signUp,
  signIn: legacy.signIn,
  signInAnonymously: legacy.signInAnonymously,
  seedIfNewUser: legacy.seedIfNewUser,
};
