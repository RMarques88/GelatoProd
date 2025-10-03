export function logDebug(message: string, payload?: unknown) {
  if (__DEV__) {
    console.log(`[debug] ${message}`, payload ?? '');
  }
}

export function logError(error: unknown, context?: string) {
  console.error(`[error] ${context ?? 'app'}`, error);
}
