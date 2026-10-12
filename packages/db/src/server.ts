import "server-only";

/** The app-wide database client. Server-only: it opens connections with node-postgres. */
export { db } from "./client";
