/**
 * @autonomux/auth/backup-codes
 *
 * Re-exports the backup-code primitives from `./totp.js`. Kept as a separate
 * subpath because the route handler that displays / verifies codes does not
 * need the rest of the TOTP API surface.
 */

export {
  generateBackupCodes,
  hashBackupCode,
  hashBackupCodes,
  verifyBackupCode,
} from "./totp";
