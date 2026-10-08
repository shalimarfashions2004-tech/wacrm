'use client';
import { createContext, useContext } from 'react';

// Hidden retained panels must not leave a modal visible in a portal outside
// their hidden DOM subtree. Default true keeps all other dialogs unchanged.
export const PanelActivity = createContext(true);
export function usePanelActive() {
  return useContext(PanelActivity);
}
