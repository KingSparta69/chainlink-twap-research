export function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export function parseDurationSec(args: string[]): number | undefined {
  const raw = argValue(args, "--duration");
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--duration must be a positive number of seconds (got ${raw})`);
  return n;
}

export function parseStaleMs(args: string[], fallback = 15_000): number {
  const raw = argValue(args, "--stale-ms");
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--stale-ms must be >= 0 (got ${raw})`);
  return n;
}
