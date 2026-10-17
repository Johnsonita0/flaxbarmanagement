import { createContext, useContext } from "react";

export const PageNavigationContext = createContext<(() => void) | null>(null);

export function usePageBack() {
  return useContext(PageNavigationContext);
}
