export const E18 = 10n ** 18n;

export function formatE18(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / E18;
  const fraction = (absolute % E18).toString().padStart(18, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function parseDecimal(a: string, b: string): number | null {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return x - y;
}

export function deltaString(a: string, b: string): string | undefined {
  const d = parseDecimal(a, b);
  if (d == null) return undefined;
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d.toFixed(4)}`;
}
