import { useTranslation } from 'react-i18next';
import { ActionButton, cx, fieldClass } from '../components/ui';
import {
  MAX_COLUMNS,
  MAX_SIZES,
  newRow,
  type BodyField,
  type ChartDraft,
  type ChartProblem,
  type ChartRowDraft,
  type RangeDraft,
  type Unit,
} from './sizeChart';

export interface SizeChartPanelProps {
  draft: ChartDraft;
  onChange: (draft: ChartDraft) => void;
  problems: ChartProblem[];
  disabled?: boolean;
}

const BODY_FIELDS: BodyField[] = ['height', 'weight', 'chest'];
const cell = cx(fieldClass, 'w-20 px-2 py-1 text-sm');

/** The size chart as a table: a row per size, garment measurements, then the body each size fits. */
export function SizeChartPanel({ draft, onChange, problems, disabled }: SizeChartPanelProps) {
  const { t } = useTranslation();
  const { columns, rows } = draft;

  const setRow = (index: number, patch: Partial<ChartRowDraft>) =>
    onChange({ columns, rows: rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  const setValue = (row: number, column: number, value: string) =>
    setRow(row, { values: rows[row]!.values.map((v, i) => (i === column ? value : v)) });
  const setRange = (row: number, field: BodyField, patch: Partial<RangeDraft>) =>
    setRow(row, { [field]: { ...rows[row]![field], ...patch } });
  const setColumn = (index: number, patch: { label?: string; unit?: Unit }) =>
    onChange({ columns: columns.map((c, i) => (i === index ? { ...c, ...patch } : c)), rows });
  const addColumn = () =>
    onChange({
      columns: [...columns, { label: '', unit: 'in' }],
      rows: rows.map((r) => ({ ...r, values: [...r.values, ''] })),
    });
  const removeColumn = (index: number) =>
    onChange({
      columns: columns.filter((_, i) => i !== index),
      rows: rows.map((r) => ({ ...r, values: r.values.filter((_, i) => i !== index) })),
    });

  const invalid = (match: (p: ChartProblem) => boolean) => problems.some(match);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-left align-bottom text-ink-muted">
              <th className="p-1 font-medium">{t('sizeChart.size')}</th>
              {columns.map((column, c) => (
                <th key={c} className="p-1 font-medium">
                  <span className="flex flex-col gap-1">
                    <input
                      className={cx(fieldClass, 'w-24 px-2 py-1 text-sm')}
                      aria-label={t('sizeChart.columnLabel', { number: c + 1 })}
                      aria-invalid={invalid((p) => p.kind === 'column' && p.column === c)}
                      placeholder={t('sizeChart.columnPlaceholder')}
                      value={column.label}
                      maxLength={40}
                      disabled={disabled}
                      onChange={(e) => setColumn(c, { label: e.target.value })}
                    />
                    <span className="flex gap-1">
                      <select
                        className={cx(fieldClass, 'px-1 py-1 text-sm')}
                        aria-label={t('sizeChart.columnUnit', { number: c + 1 })}
                        value={column.unit}
                        disabled={disabled}
                        onChange={(e) => setColumn(c, { unit: e.target.value as Unit })}
                      >
                        <option value="in">{t('sizeChart.inches')}</option>
                        <option value="cm">{t('sizeChart.cm')}</option>
                      </select>
                      <ActionButton
                        size="sm"
                        tone="danger"
                        disabled={disabled}
                        aria-label={t('sizeChart.removeColumn', { name: column.label || c + 1 })}
                        onClick={() => removeColumn(c)}
                      >
                        ×
                      </ActionButton>
                    </span>
                  </span>
                </th>
              ))}
              {BODY_FIELDS.map((field) => (
                <th key={field} className="p-1 font-medium">
                  {t(`sizeChart.body.${field}`)}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="align-top">
                <td className="p-1">
                  <input
                    className={cell}
                    aria-label={t('sizeChart.sizeOfRow', { number: r + 1 })}
                    aria-invalid={invalid((p) => p.kind === 'size' && p.row === r)}
                    value={row.size}
                    maxLength={40}
                    disabled={disabled}
                    onChange={(e) => setRow(r, { size: e.target.value })}
                  />
                </td>
                {columns.map((column, c) => (
                  <td key={c} className="p-1">
                    <input
                      className={cell}
                      inputMode="decimal"
                      aria-label={t('sizeChart.valueOf', {
                        size: row.size || r + 1,
                        name: column.label || c + 1,
                      })}
                      aria-invalid={invalid(
                        (p) => p.kind === 'value' && p.row === r && p.column === c,
                      )}
                      value={row.values[c] ?? ''}
                      disabled={disabled}
                      onChange={(e) => setValue(r, c, e.target.value)}
                    />
                  </td>
                ))}
                {BODY_FIELDS.map((field) => (
                  <td key={field} className="p-1">
                    <span className="flex items-center gap-1">
                      {(['min', 'max'] as const).map((end) => (
                        <input
                          key={end}
                          className={cx(fieldClass, 'w-16 px-2 py-1 text-sm')}
                          inputMode="decimal"
                          aria-label={t(`sizeChart.${end}Of`, {
                            size: row.size || r + 1,
                            name: t(`sizeChart.body.${field}`),
                          })}
                          aria-invalid={invalid(
                            (p) => p.kind === 'range' && p.row === r && p.field === field,
                          )}
                          placeholder={t(`sizeChart.${end}`)}
                          value={row[field][end]}
                          disabled={disabled}
                          onChange={(e) => setRange(r, field, { [end]: e.target.value })}
                        />
                      ))}
                    </span>
                  </td>
                ))}
                <td className="p-1">
                  <ActionButton
                    size="sm"
                    tone="danger"
                    disabled={disabled}
                    onClick={() => onChange({ columns, rows: rows.filter((_, i) => i !== r) })}
                  >
                    {t('sizeChart.removeSize')}
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {problems.length > 0 && (
        <ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-danger-ink">
          {problems.map((p, i) => (
            <li key={i}>{problemText(t, p, draft)}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <ActionButton
          disabled={disabled || rows.length >= MAX_SIZES}
          onClick={() => onChange({ columns, rows: [...rows, newRow(columns.length)] })}
        >
          {t('sizeChart.addSize')}
        </ActionButton>
        <ActionButton disabled={disabled || columns.length >= MAX_COLUMNS} onClick={addColumn}>
          {t('sizeChart.addColumn')}
        </ActionButton>
      </div>
    </div>
  );
}

function problemText(
  t: ReturnType<typeof useTranslation>['t'],
  p: ChartProblem,
  draft: ChartDraft,
): string {
  const size = (row: number) => draft.rows[row]?.size.trim() || String(row + 1);
  switch (p.kind) {
    case 'column':
      return t('sizeChart.problem.column', { number: p.column + 1 });
    case 'size':
      return t(`sizeChart.problem.size_${p.reason}`, { number: p.row + 1, size: size(p.row) });
    case 'value':
      return t('sizeChart.problem.value', {
        size: size(p.row),
        name: draft.columns[p.column]?.label || p.column + 1,
      });
    case 'range':
      return t('sizeChart.problem.range', {
        size: size(p.row),
        name: t(`sizeChart.body.${p.field}`),
      });
    case 'empty':
      return t('sizeChart.problem.empty', { size: size(p.row) });
  }
}
