import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(__dirname, "../../scripts/restore-check.sh");

/** Runs the script with fake psql and pg_restore that only log their arguments. */
function run(scratch: string, live: string | undefined) {
  const bin = mkdtempSync(join(tmpdir(), "restore-check-"));
  const log = join(bin, "calls.log");
  for (const tool of ["psql", "pg_restore"]) {
    writeFileSync(join(bin, tool), `#!/usr/bin/env bash\necho "${tool} $*" >> "${log}"\necho 0\n`);
    chmodSync(join(bin, tool), 0o755);
  }
  writeFileSync(log, "");
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: `${bin}:${process.env.PATH}`, SCRATCH_DATABASE_URL: scratch };
  if (live !== undefined) env.DATABASE_URL = live;
  let status = 0;
  try {
    execFileSync("bash", [script, "backup.dump"], { env, stdio: "pipe" });
  } catch (error) {
    status = (error as { status: number }).status;
  }
  return { status, calls: readFileSync(log, "utf8") };
}

describe("restore-check.sh", () => {
  it.each([
    ["the same URL with a query on both", "postgresql://u:p@db:5432/bolidesk?schema=public", "postgresql://u:p@db:5432/bolidesk?schema=public"],
    ["a query on one side only", "postgresql://u:p@db:5432/bolidesk?schema=public", "postgresql://u:p@db:5432/bolidesk"],
    ["another user and the default port", "postgresql://admin:x@db/bolidesk", "postgresql://u:p@db:5432/bolidesk?schema=public"],
    ["localhost and 127.0.0.1", "postgresql://u:p@localhost:5433/bolidesk", "postgresql://u:p@127.0.0.1:5433/bolidesk"],
    ["an IPv6 host with and without the default port", "postgresql://u:p@[::1]:5432/bolidesk", "postgresql://u:p@[::1]/bolidesk"],
    ["a percent-encoded database name", "postgresql://u:p@db/bolidesk", "postgresql://u:p@db/boli%64esk"],
    ["a host in another case", "postgresql://u:p@DB.example:5432/bolidesk", "postgresql://u:p@db.example/bolidesk"],
  ])("refuses %s before any database command", (_name, scratch, live) => {
    const result = run(scratch, live);
    expect(result.status).not.toBe(0);
    expect(result.calls).toBe("");
  });

  it("refuses when DATABASE_URL is not set", () => {
    const result = run("postgresql://u:p@db/bolidesk_restore", undefined);
    expect(result.status).not.toBe(0);
    expect(result.calls).toBe("");
  });

  it("lets an IPv6 scratch database on another port through", () => {
    const result = run("postgresql://u:p@[::1]:5433/bolidesk_restore", "postgresql://u:p@[::1]:5432/bolidesk");
    expect(result.status).toBe(0);
    expect(result.calls).toContain('DROP DATABASE IF EXISTS "bolidesk_restore"');
  });

  it("drops only the scratch database", () => {
    const result = run("postgresql://u:p@db:5432/bolidesk_restore?schema=public", "postgresql://u:p@db:5432/bolidesk?schema=public");
    expect(result.status).toBe(0);
    expect(result.calls).toContain('DROP DATABASE IF EXISTS "bolidesk_restore"');
  });
});
