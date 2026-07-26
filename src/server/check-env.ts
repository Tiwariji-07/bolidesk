import { validateEnvironment } from "./env";

const issues = validateEnvironment();
if (issues.length) {
  for (const issue of issues) console.error(`${issue.variable}: ${issue.message}`);
  process.exitCode = 1;
} else {
  console.log("Environment configuration is valid.");
}
