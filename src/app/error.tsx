"use client";

export default function Error({ reset }: { reset: () => void }) {
  return <div className="error-state"><h1>Something needs a second try.</h1><p>Your work is safe. Refresh this view or try again.</p><button className="button" onClick={reset}>Try again</button></div>;
}
