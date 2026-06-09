/**
 * Client-side mock helper for TanStack Start's `useServerFn` hook.
 * Directly returns the function to avoid refactoring the components' call sites.
 */
export function useServerFn<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return fn;
}
