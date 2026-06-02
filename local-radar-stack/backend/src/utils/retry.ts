export async function withRetry<T>(
  task: () => Promise<T>,
  maxRetries: number,
  baseDelayMs = 200
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      const delayMs = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt += 1;
    }
  }

  throw lastError;
}
