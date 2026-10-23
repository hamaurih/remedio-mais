import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Supabase migration policy", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql"));

  it("keeps the branch-replay repair migration versioned in Git", () => {
    expect(files).toContain("20261023234259_neutralize_restore_backup_branch_replay.sql");
  });

  it("does not add production backup restore migrations to the normal migration chain", () => {
    const restoreFiles = files.filter((name) => /restore_backup_/i.test(name));
    expect(restoreFiles).toEqual([]);
  });

  it("does not restore auth.users from normal migrations", () => {
    const offenders = [];
    for (const name of files) {
      if (name === "20261023234259_neutralize_restore_backup_branch_replay.sql") continue;
      const sql = readFileSync(join(dir, name), "utf8");
      if (/insert\s+into\s+["']?auth["']?\.["']?users["']?/i.test(sql)) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("repair archives original statements before neutralizing replay", () => {
    const sql = readFileSync(
      join(dir, "20261023234259_neutralize_restore_backup_branch_replay.sql"),
      "utf8",
    );
    expect(sql).toContain("private.migration_replay_archive_20261023");
    expect(sql).toContain("where name like 'restore_backup_%'");
    expect(sql).toContain("update supabase_migrations.schema_migrations");
  });
});
