import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Supabase migration policy", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql"));

  it("does not add production backup restore migrations to the normal migration chain", () => {
    const restoreFiles = files.filter((name) => /restore_backup_/i.test(name));
    expect(restoreFiles).toEqual([]);
  });

  it("does not restore auth.users from normal migrations", () => {
    const offenders: string[] = [];
    for (const name of files) {
      const sql = readFileSync(join(dir, name), "utf8");
      if (/insert\s+into\s+["']?auth["']?\.["']?users["']?/i.test(sql)) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not couple app migrations to Supabase internal migration history", () => {
    const offenders: string[] = [];
    for (const name of files) {
      const sql = readFileSync(join(dir, name), "utf8").toLowerCase();
      if (sql.includes("supabase_migrations.schema_migrations")) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });
});
