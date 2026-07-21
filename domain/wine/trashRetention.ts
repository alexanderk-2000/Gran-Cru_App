export const TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left before a soft-deleted wine is auto-purged; <= 0 means expired. */
export const getDaysRemaining = (deletedAt: string, now: number = Date.now()): number =>
  Math.ceil((new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * DAY_MS - now) / DAY_MS);

export const isExpired = (deletedAt: string, now: number = Date.now()): boolean =>
  getDaysRemaining(deletedAt, now) <= 0;
