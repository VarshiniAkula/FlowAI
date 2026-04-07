import type { ConditionExpression } from '@flowmind/shared';

/**
 * Safely evaluate a `ConditionExpression` against a context dict.
 *
 * Supports the standard operators (eq/neq/gt/lt/gte/lte/contains/exists/matches)
 * plus boolean composition via `logic` + `children`.
 */
export function evaluateCondition(
  expr: ConditionExpression,
  context: Record<string, unknown>,
): boolean {
  if (expr.children && expr.children.length > 0) {
    const results = expr.children.map((c) => evaluateCondition(c, context));
    return expr.logic === 'or' ? results.some(Boolean) : results.every(Boolean);
  }

  const left = readField(context, expr.field);
  const right = expr.value;

  switch (expr.operator) {
    case 'exists':
      return left !== undefined && left !== null && left !== '';
    case 'eq':
      return softEq(left, right);
    case 'neq':
      return !softEq(left, right);
    case 'gt':
      return num(left) > num(right);
    case 'lt':
      return num(left) < num(right);
    case 'gte':
      return num(left) >= num(right);
    case 'lte':
      return num(left) <= num(right);
    case 'contains':
      return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
    case 'matches':
      try {
        return new RegExp(String(right)).test(String(left ?? ''));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function readField(ctx: Record<string, unknown>, field: string): unknown {
  if (!field) return undefined;
  const parts = field.split('.');
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function softEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}
