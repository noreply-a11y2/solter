export interface ProgressState {
  completed: number;
  total: number;
  done: boolean;
  stopped: boolean;
  skipped: number;
  konsolehFound: number;
  cpanelFound: number;
  currentEmail: string;
}
export const progressStore = new Map<string, ProgressState>();
