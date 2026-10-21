/** Refuses to serve production traffic with missing or unsafe configuration. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnvironment } = await import("./server/env");
  const issues = validateEnvironment();
  if (!issues.length) return;
  const summary = issues.map((issue) => `${issue.variable}: ${issue.message}`).join("\n");
  if (process.env.NODE_ENV === "production") throw new Error(`BoliDesk configuration is invalid:\n${summary}`);
  console.warn(`BoliDesk configuration issues:\n${summary}`);
}
