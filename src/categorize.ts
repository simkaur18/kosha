export interface CategoryRule {
  id: string;
  name: string;
  matchPattern: string; // a "|"-joined regex fragment, matched case-insensitively
}

/**
 * Matches a vendor name against the Smart Rules loaded from the categories
 * table. Returns null (uncategorized) rather than guessing when nothing matches
 * — the daily/monthly review is where a person teaches Kosha new rules.
 */
export function categorize(vendor: string | null, rules: CategoryRule[]): string | null {
  if (!vendor) return null;
  for (const rule of rules) {
    const pattern = new RegExp(rule.matchPattern, "i");
    if (pattern.test(vendor)) return rule.name;
  }
  return null;
}
