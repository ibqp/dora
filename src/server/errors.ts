/** Domain errors raised by server services. The API layer maps them to HTTP responses. */

export class NotFoundError extends Error {
  override readonly name = "NotFoundError";
  constructor(resource: string) {
    super(`${resource} not found`);
  }
}

/** The idempotency key was already used for a different request. */
export class IdempotencyConflictError extends Error {
  override readonly name = "IdempotencyConflictError";
  constructor() {
    super("This clientRequestId was already used for a different message");
  }
}

/** DATABASE_URL is missing; raised by the database client. */
export class DatabaseConfigurationError extends Error {
  override readonly name = "DatabaseConfigurationError";
}

/** Another message of the same session is still being processed. */
export class SessionBusyError extends Error {
  override readonly name = "SessionBusyError";
  constructor() {
    super("DORA is still processing a previous message in this session. Please try again in a moment.");
  }
}

/** Stored data failed validation (e.g. a corrupted JSON column). Never caused by the client. */
export class DataIntegrityError extends Error {
  override readonly name = "DataIntegrityError";
}

/** BRD generation was requested without consent although required fields are missing. */
export class IncompleteRequirementsError extends Error {
  override readonly name = "IncompleteRequirementsError";
  constructor(readonly missing: readonly { key: string; label: string }[]) {
    super(`${missing.length} required field(s) are not specified. Confirm to generate a draft BRD.`);
  }
}
