"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/** Shares "the editor has unsaved changes" with other actions on a draft, such as cash-on-draft. */
const DraftGuard = createContext<{ dirty: boolean; setDirty: (dirty: boolean) => void } | null>(null);

export function DraftGuardProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  return <DraftGuard.Provider value={{ dirty, setDirty }}>{children}</DraftGuard.Provider>;
}

export function useDraftGuard() {
  return useContext(DraftGuard);
}
