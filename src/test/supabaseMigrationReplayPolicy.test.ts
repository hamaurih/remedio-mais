import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const POLICY_START = "20261023231324";
const UUID_RE = /['"]?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}['"]?/ig;

function futureMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => name.slice(0, 14) >= POLICY_START)
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
    }));
}

describe("Supabase migration replay policy", () => {
  it("does not couple application migrations to Supabase internal migration history", () => {
    for (const migration of futureMigrations()) {
      expect(
        migration.sql.toLowerCase(),
        `${migration.name} must not query supabase_migrations.schema_migrations`,
      ).not.toContain("supabase_migrations.schema_migrations");
    }
  });

  it("does not embed production UUIDs in operational DML", () => {
    for (const migration of futureMigrations()) {
      const normalized = migration.sql.toLowerCase();
      const hasOperationalDml =
        /\b(insert\s+into|update|delete\s+from)\s+public\./i.test(migration.sql);
      const uuidLiterals = migration.sql.match(UUID_RE) || [];
      const explicitlyAllowed = normalized.includes("-- allow-production-data-migration");

      if (hasOperationalDml && uuidLiterals.length > 0 && !explicitlyAllowed) {
        throw new Error(
          `${migration.name} contains operational DML with hard-coded UUID(s). ` +
          "Move environment-specific data to a seed/repair workflow, or document the exceptional migration with " +
          "-- allow-production-data-migration after review.",
        );
      }
    }
  });

  it("keeps branch repair migrations replay-safe", () => {
    const names = futureMigrations().map((m) => m.name);
    expect(names).toContain("20261023231324_branch_repair_metadata_table_v2.sql");
    expect(names).toContain("20261023231328_branch_safe_prescription_notification_v2.sql");
    expect(names).toContain("20261023231332_branch_safe_trier_inactive_guard_v2.sql");
  });
});
