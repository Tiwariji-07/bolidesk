import bcrypt from "bcrypt";

/** bcrypt only reads the first 72 bytes; longer passwords would silently share a hash. */
export const MAX_PASSWORD_BYTES = 72;
const DUMMY_HASH = "$2b$12$rDebLnPobaXHRss1X.bffeEMKUE0lJ9i4TVv9RIjsyNt1.bgfcTp6";

export function passwordProblem(password: string): string | null {
  if (password.length < 12) return "Use a password of at least 12 characters.";
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return "Use a password of at most 72 bytes.";
  return null;
}

export async function hashPassword(password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  return bcrypt.hash(password, 12);
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

type AuthenticationDatabase = {
  user: { findUnique: (input: { where: { email: string } }) => Promise<{ id: string; email: string; passwordHash: string } | null> };
};

/** Compares against a dummy hash for unknown emails so response time does not reveal which emails exist. */
export async function authenticateUser(db: AuthenticationDatabase, email: string, password: string) {
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return null;
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } });
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  return user && matches ? { id: user.id, email: user.email } : null;
}

type RegistrationDatabase = {
  $transaction: <T>(callback: (tx: {
    user: { create: (input: { data: { email: string; name?: string; passwordHash: string } }) => Promise<{ id: string; email: string }> };
    workspace: { create: (input: { data: { name: string; brandName: string } }) => Promise<{ id: string }> };
    membership: { create: (input: { data: { userId: string; workspaceId: string; role: "OWNER" } }) => Promise<{ id: string }> };
  }) => Promise<T>) => Promise<T>;
};

export async function registerWorkspaceOwner(db: RegistrationDatabase, input: { email: string; name?: string; password: string; workspaceName: string }) {
  const email = normalizeEmail(input.email);
  const workspaceName = input.workspaceName.trim();
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name: input.name?.trim() || undefined, passwordHash } });
    const workspace = await tx.workspace.create({ data: { name: workspaceName, brandName: workspaceName } });
    const membership = await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
    return { userId: user.id, workspaceId: workspace.id, membershipId: membership.id };
  });
}

const failures = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

/** Per-process throttle on failed sign-ins for one email. Enough for a single-server shop deployment. */
export const loginThrottle = {
  blocked(key: string, now = Date.now()) {
    const entry = failures.get(key);
    return Boolean(entry && entry.resetAt > now && entry.count >= MAX_FAILURES);
  },
  fail(key: string, now = Date.now()) {
    const entry = failures.get(key);
    if (!entry || entry.resetAt <= now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    else entry.count += 1;
  },
  clear(key: string) {
    failures.delete(key);
  },
};
