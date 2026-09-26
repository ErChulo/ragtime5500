export function normalizePlanNumber(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return String(Number(text));
  return text.toUpperCase();
}

export function samePlanNumber(a: unknown, b: unknown): boolean {
  const left = normalizePlanNumber(a);
  const right = normalizePlanNumber(b);
  return left !== null && right !== null && left === right;
}

export function displayPlanNumber(value: unknown): string {
  const normalized = normalizePlanNumber(value);
  return normalized ?? 'Not reported';
}
