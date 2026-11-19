/**
 * Runs an async mapper over items with a fixed concurrency, preserving input
 * order in the results. Failed items yield null.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onSettled?: (completed: number, failed: number) => void
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  let completed = 0;
  let failed = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = await mapper(items[index]!, index);
      } catch {
        failed++;
        results[index] = null;
      }
      completed++;
      onSettled?.(completed, failed);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}
