/** Variant options are edited as one line, "Size: M, Color: Black", and sent as an object. */

export function formatOptions(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(', ');
}

/** Returns null when a part is not "name: value", so the form can say what is wrong. */
export function parseOptions(input: string): Record<string, string> | null {
  const options: Record<string, string> = {};
  for (const part of input.split(',')) {
    if (!part.trim()) continue;
    const [name = '', ...rest] = part.split(':');
    const value = rest.join(':').trim();
    if (!name.trim() || !value) return null;
    options[name.trim()] = value;
  }
  return options;
}

export function parseAliases(input: string): string[] {
  return input
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}

/** The API accepts at most this many variants in one product (`ProductCreate`). */
export const MAX_VARIANTS = 100;

/** One option as typed in the builder: a name and its values, separated by commas. */
export interface OptionDraft {
  name: string;
  values: string;
}

export interface BuiltOption {
  name: string;
  values: string[];
}

export interface MatrixRow {
  /** Stable across rebuilds, so edits typed into a row survive changes to other options. */
  key: string;
  option_values: Record<string, string>;
  /** Poisha, or null while the base price is not a valid amount. */
  price_minor: number | null;
}

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Trim, drop blanks and case-insensitive duplicates, keep the first spelling and the order. */
export function splitValues(input: string): string[] {
  const values: string[] = [];
  for (const part of input.split(',')) {
    const value = part.trim();
    if (value && !values.some((v) => sameText(v, value))) values.push(value);
  }
  return values;
}

/** Drop options without a name or values, and repeated option names (the first one wins). */
export function builtOptions(drafts: OptionDraft[]): BuiltOption[] {
  const options: BuiltOption[] = [];
  for (const draft of drafts) {
    const name = draft.name.trim();
    const values = splitValues(draft.values);
    if (name && values.length && !options.some((o) => sameText(o.name, name))) {
      options.push({ name, values });
    }
  }
  return options;
}

/** How many variants the options produce (one when there are no options). */
export function matrixSize(options: BuiltOption[]): number {
  return options.reduce((count, option) => count * option.values.length, 1);
}

export function rowKey(optionValues: Record<string, string>): string {
  return JSON.stringify(Object.entries(optionValues));
}

/**
 * Every combination of the options, in order (the first option varies slowest). No options gives
 * one default row. Over the limit no rows are built, so a typo cannot freeze the page.
 */
export function buildMatrix(
  options: BuiltOption[],
  basePriceMinor: number | null,
): { rows: MatrixRow[]; count: number; overLimit: boolean } {
  const count = matrixSize(options);
  if (count > MAX_VARIANTS) return { rows: [], count, overLimit: true };
  let combinations: Record<string, string>[] = [{}];
  for (const option of options) {
    combinations = combinations.flatMap((so_far) =>
      option.values.map((value) => ({ ...so_far, [option.name]: value })),
    );
  }
  const rows = combinations.map((option_values) => ({
    key: rowKey(option_values),
    option_values,
    price_minor: basePriceMinor,
  }));
  return { rows, count, overLimit: false };
}

/** Whole-percent saving of `price` against `regular` (rounded down), or null when there is none. */
export function discountPercent(price: number | null, regular: number | null): number | null {
  if (price === null || regular === null || regular <= price) return null;
  return Math.floor(((regular - price) * 100) / regular);
}

export interface FactDraft {
  label: string;
  value: string;
}

/** Trim facts and drop those without a value, as the API does; keeps the merchant's order. */
export function factsPayload(drafts: FactDraft[]): FactDraft[] {
  return drafts
    .map((d) => ({ label: d.label.trim(), value: d.value.trim() }))
    .filter((d) => d.value);
}
