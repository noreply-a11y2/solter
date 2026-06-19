// Shared in-memory progress store
export const progressStore = new Map<string, { completed: number; total: number; done: boolean }>();
