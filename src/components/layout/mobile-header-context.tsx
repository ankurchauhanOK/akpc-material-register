"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type MobileHeaderContextValue = {
  /** The dynamic title shown in the mobile header (set by sub-pages). */
  title: string | null;
  setTitle: (title: string | null) => void;
};

const MobileHeaderContext = createContext<MobileHeaderContextValue>({
  title: null,
  setTitle: () => {},
});

export function MobileHeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const updateTitle = useCallback((t: string | null) => setTitle(t), []);

  return (
    <MobileHeaderContext value={{ title, setTitle: updateTitle }}>
      {children}
    </MobileHeaderContext>
  );
}

export function useMobileHeaderTitle() {
  return useContext(MobileHeaderContext);
}
