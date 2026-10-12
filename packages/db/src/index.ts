// Models, enums and the `Prisma` namespace: import them from "@wadzzo/db" so the
// generated client has exactly one home. Safe in the browser (no connection code).
export * from "@prisma/client";

/** The shared client's type (with the secret omits), for helpers that take `db`. */
export type { Db } from "./client";
