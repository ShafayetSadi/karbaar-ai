import { useState } from 'react';

export type ViewMode = 'table' | 'grid';

const KEY = 'products:view';

function read(): ViewMode {
  try {
    return localStorage.getItem(KEY) === 'grid' ? 'grid' : 'table';
  } catch {
    // Blocked storage: the table.
    return 'table';
  }
}

/** Table or grid, remembered per viewer on this device. */
export function useViewMode() {
  const [mode, setMode] = useState<ViewMode>(read);
  function change(next: ViewMode) {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not remembered; still switches.
    }
  }
  return [mode, change] as const;
}
