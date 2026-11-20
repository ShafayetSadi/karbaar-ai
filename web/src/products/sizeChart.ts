import type { components } from '../api/schema';

export type SizeChartRow = components['schemas']['SizeChartRowModel-Output'];
type SizeChartInput = components['schemas']['SizeChartRowModel-Input'];

export const MAX_SIZES = 30;
export const MAX_COLUMNS = 8;

export type Unit = 'in' | 'cm';

/** A garment measurement every size is given, such as "Chest (in)". */
export interface ChartColumn {
  label: string;
  unit: Unit;
}

export interface RangeDraft {
  min: string;
  max: string;
}

export interface ChartRowDraft {
  size: string;
  /** One per column, in column order; blank when the size has no value for it. */
  values: string[];
  height: RangeDraft;
  weight: RangeDraft;
  chest: RangeDraft;
}

export interface ChartDraft {
  columns: ChartColumn[];
  rows: ChartRowDraft[];
}

export type BodyField = 'height' | 'weight' | 'chest';

export type ChartProblem =
  | { kind: 'column'; column: number }
  | { kind: 'size'; row: number; reason: 'required' | 'duplicate' }
  | { kind: 'value'; row: number; column: number }
  | { kind: 'range'; row: number; field: BodyField }
  | { kind: 'empty'; row: number };

const EMPTY_RANGE: RangeDraft = { min: '', max: '' };
const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

export const NEW_CHART: ChartDraft = {
  columns: [
    { label: 'Chest', unit: 'in' },
    { label: 'Length', unit: 'in' },
  ],
  rows: [],
};

export function newRow(columns: number): ChartRowDraft {
  return {
    size: '',
    values: Array.from({ length: columns }, () => ''),
    height: EMPTY_RANGE,
    weight: EMPTY_RANGE,
    chest: EMPTY_RANGE,
  };
}

const rangeDraft = (range: { min: number | string; max: number | string } | null | undefined) =>
  range ? { min: String(range.min), max: String(range.max) } : EMPTY_RANGE;

/** The saved chart as an editable table: columns are the measurements in the order first seen. */
export function chartDraftOf(rows: SizeChartRow[]): ChartDraft {
  if (rows.length === 0) return NEW_CHART;
  const columns: ChartColumn[] = [];
  for (const row of rows) {
    for (const m of row.measurements ?? []) {
      if (!columns.some((c) => c.label.toLowerCase() === m.label.toLowerCase())) {
        columns.push({ label: m.label, unit: m.unit });
      }
    }
  }
  return {
    columns,
    rows: rows.map((row) => ({
      size: row.size,
      values: columns.map(
        (c) =>
          row.measurements?.find((m) => m.label.toLowerCase() === c.label.toLowerCase())?.value ??
          '',
      ),
      height: rangeDraft(row.height_cm),
      weight: rangeDraft(row.weight_kg),
      chest: rangeDraft(row.chest_in),
    })),
  };
}

/**
 * A measurement typed by a person ("42", "42.5", "৪২") as the exact decimal string the API keeps.
 * Null for anything else, including more than one decimal: never round a measurement silently.
 */
export function parseMeasure(input: string): string | null {
  const normalised = input.trim().replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)));
  const match = /^(\d{1,3})(?:\.(\d))?$/.exec(normalised);
  if (!match) return null;
  const whole = String(Number(match[1]));
  return match[2] && match[2] !== '0' ? `${whole}.${match[2]}` : whole;
}

function parseRange(
  range: RangeDraft,
  whole: boolean,
): { min: string; max: string } | null | 'bad' {
  if (!range.min.trim() && !range.max.trim()) return null;
  const min = parseMeasure(range.min);
  const max = parseMeasure(range.max);
  if (min === null || max === null || Number(min) > Number(max)) return 'bad';
  if (whole && (min.includes('.') || max.includes('.'))) return 'bad';
  return { min, max };
}

/** The table in the API's shape, or every problem found. Plausible ranges are checked by the API. */
export function chartPayload(
  draft: ChartDraft,
): { rows: SizeChartInput[] } | { problems: ChartProblem[] } {
  const problems: ChartProblem[] = [];
  const used = draft.columns.map((_, i) =>
    draft.rows.some((r) => (r.values[i] ?? '').trim() !== ''),
  );
  draft.columns.forEach((column, i) => {
    if (used[i] && !column.label.trim()) problems.push({ kind: 'column', column: i });
  });
  const seen = new Set<string>();
  const rows: SizeChartInput[] = [];
  draft.rows.forEach((row, r) => {
    const size = row.size.trim();
    if (!size) problems.push({ kind: 'size', row: r, reason: 'required' });
    else if (seen.has(size.toLowerCase()))
      problems.push({ kind: 'size', row: r, reason: 'duplicate' });
    seen.add(size.toLowerCase());

    const before = problems.length;
    const measurements: SizeChartInput['measurements'] = [];
    draft.columns.forEach((column, c) => {
      const raw = (row.values[c] ?? '').trim();
      if (!raw) return;
      const value = parseMeasure(raw);
      if (value === null || Number(value) === 0)
        problems.push({ kind: 'value', row: r, column: c });
      else measurements.push({ label: column.label.trim(), value, unit: column.unit });
    });
    const ranges = {
      height: parseRange(row.height, true),
      weight: parseRange(row.weight, true),
      chest: parseRange(row.chest, false),
    };
    for (const field of ['height', 'weight', 'chest'] as const) {
      if (ranges[field] === 'bad') problems.push({ kind: 'range', row: r, field });
    }
    const body = (field: BodyField) => {
      const range = ranges[field];
      return range === 'bad' ? null : range;
    };
    const whole = (range: { min: string; max: string } | null) =>
      range ? { min: Number(range.min), max: Number(range.max) } : null;
    // A row whose only entries are wrong is told about those, not also called empty.
    const filled = measurements.length > 0 || body('height') || body('weight') || body('chest');
    if (!filled && !problems.slice(before).some((p) => p.kind !== 'size')) {
      problems.push({ kind: 'empty', row: r });
    }
    rows.push({
      size,
      measurements,
      height_cm: whole(body('height')),
      weight_kg: whole(body('weight')),
      chest_in: body('chest'),
    });
  });
  return problems.length > 0 ? { problems } : { rows };
}
