// `prisma db push` can drop columns and tables on the shared database. It only
// runs when you say which database you mean, so nobody pushes by habit.
import { spawnSync } from "node:child_process";

if (process.env.CONFIRM_DB_PUSH !== "yes") {
  console.error(
    [
      "Refusing to run `prisma db push`.",
      "This schema is the shared database's source of truth; a push can drop data.",
      "Check DATABASE_URL points at the database you intend, then run:",
      "  CONFIRM_DB_PUSH=yes pnpm --filter @wadzzo/db push",
    ].join("\n"),
  );
  process.exit(1);
}

const result = spawnSync("prisma", ["db", "push"], { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
