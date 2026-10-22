/**
 * MIRAI — size chart + recommendation logic.
 *
 * CHEST_CM = body chest circumference (cm) at the centre of each size.
 * Tune these to your brand's real chart after testing with people whose size you know.
 */
export const CHEST_CM: Record<string, number> = {
  XS: 86,
  S: 91,
  M: 97,
  L: 102,
  XL: 107,
  XXL: 113,
  '3XL': 120,
};

/** Only tops can be sized from shoulders / chest. */
export const TOP_CATEGORIES = new Set([
  'shirts',
  'tshirts',
  'jackets',
  'hoodies',
  'sweaters',
  'kurtas',
]);

export interface SizeRecommendation {
  size: string;
  /** Set when the user is between two sizes (within 2 cm). */
  alternate: string | null;
}

export function recommendSize(
  categoryId: string,
  sizes: string[],
  chestCm: number
): SizeRecommendation | null {
  if (!TOP_CATEGORIES.has(categoryId)) return null;

  const ranked = sizes
    .filter((s) => CHEST_CM[s] !== undefined)
    .map((s) => ({ s, d: Math.abs(CHEST_CM[s] - chestCm) }))
    .sort((a, b) => a.d - b.d);

  if (!ranked.length) return null;

  const alternate = ranked[1] && ranked[1].d - ranked[0].d < 2 ? ranked[1].s : null;
  return { size: ranked[0].s, alternate };
}

/** Overall top size for a person (any product), nearest chest centre. */
export function sizeFromChest(chestCm: number): string {
  let best = 'M';
  let bestD = Infinity;
  for (const [size, c] of Object.entries(CHEST_CM)) {
    const d = Math.abs(c - chestCm);
    if (d < bestD) {
      bestD = d;
      best = size;
    }
  }
  return best;
}