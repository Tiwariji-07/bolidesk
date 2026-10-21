import type { Prisma } from "@prisma/client";
import { businessDate, dateOnly } from "@/domain/business-time";
import { formatINR } from "@/lib/format";
import type { Access } from "./access";
import { allocateNumber } from "./billing";
import { ConflictError, UserError } from "./errors";
import type { PaymentProvider } from "./integrations/types";
import { cancelStaleRequests, settleInTx } from "./payments";
import { logActivity, withStaffLock } from "./workspace-tx";

/**
 * Owner only. Cancels an issued invoice in full with a numbered credit note that reverses its exact lines and
 * tax heads. Money already received stays in the ledger and shows as a refund due.
 */
export async function issueCreditNote(access: Access, input: { invoiceId: string; version: number; reason: string }, provider?: PaymentProvider) {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new UserError("Write why the invoice is being cancelled (shown on the credit note).");
  const result = await withStaffLock(access, "credit.issue", async (tx, actor) => {
    const invoice = await tx.invoice.findFirst({ where: { id: input.invoiceId, workspaceId: actor.workspaceId }, include: { creditNote: true } });
    if (!invoice) throw new UserError("Invoice not found.");
    if (invoice.creditNote) throw new UserError(`Already cancelled by ${invoice.creditNote.number}.`);
    if (invoice.status === "DRAFT") throw new UserError("A draft has no number yet; just leave it unissued.");
    if (invoice.version !== input.version) throw new ConflictError();
    if (invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise !== invoice.taxPaise) throw new UserError("This invoice was issued before BoliDesk stored GST tax heads, so a credit note cannot reverse it exactly. Ask your accountant to issue one manually.");
    const issueDate = businessDate();
    const number = await allocateNumber(tx, await tx.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId } }), "CREDIT_NOTE", issueDate);
    const note = await tx.creditNote.create({ data: {
      workspaceId: actor.workspaceId, invoiceId: invoice.id, number, reason, linesJson: invoice.linesJson as Prisma.InputJsonValue,
      subtotalPaise: invoice.subtotalPaise, cgstPaise: invoice.cgstPaise, sgstPaise: invoice.sgstPaise, igstPaise: invoice.igstPaise, taxPaise: invoice.taxPaise, totalPaise: invoice.totalPaise,
      issueDate: dateOnly(issueDate), issuedByUserId: actor.userId!,
    } });
    const settled = await settleInTx(tx, invoice.id);
    await logActivity(tx, actor, `Credit note ${number} cancels ${invoice.number} (${formatINR(invoice.totalPaise)}): ${reason}`);
    return { note, ...settled };
  });
  if (provider) await cancelStaleRequests(access.workspaceId, result.staleRequestIds, provider);
  return { number: result.note.number, refundDuePaise: result.balance.refundDue };
}
