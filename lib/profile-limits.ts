/**
 * Profile cap for the local build.
 *
 * There are no plans and no accounts any more, so this is a single constant
 * rather than a value resolved from the database. It exists purely to keep the
 * picker readable; the real limit is enforced by `lib/db.ts` when a profile is
 * created.
 */
export const DEFAULT_MAX_PROFILES = 5;
