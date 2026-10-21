import type { Metadata } from "next";

export const metadata: Metadata = { title: "Payment received", robots: { index: false } };

/** Razorpay sends the customer here after paying. It proves nothing; the signed webhook records the payment. */
export default function PaymentCompletePage() {
  return <main id="main-content" className="portal-page"><section className="portal-card"><p className="eyebrow">BoliDesk</p><h1>Thank you</h1><p>Your payment is being confirmed. The shop will see it within a minute; you can close this page.</p></section></main>;
}
