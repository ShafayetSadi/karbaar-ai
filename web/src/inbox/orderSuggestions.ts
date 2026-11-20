import type { FormLine, FormValues } from '../orders/orderForm';

export type Suggestions = Record<string, FormValues>;

export function fieldValue(values: FormValues, field: string): unknown {
  if (field.startsWith('lines.')) {
    const [, id, part] = field.split('.');
    const line = values.lines.find((line) => line.variantId === id);
    return part === 'quantity' ? line?.quantity : line;
  }
  return values[field as keyof FormValues];
}

export function applyField(current: FormValues, incoming: FormValues, field: string): FormValues {
  if (!field.startsWith('lines.')) return { ...current, [field]: fieldValue(incoming, field) };
  const [, id, part] = field.split('.');
  const line = incoming.lines.find((line) => line.variantId === id);
  if (part === 'quantity') {
    return {
      ...current,
      lines: current.lines.map((value) =>
        value.variantId === id && line ? { ...value, quantity: line.quantity } : value,
      ),
    };
  }
  const exists = current.lines.some((value) => value.variantId === id);
  return {
    ...current,
    lines: line
      ? exists
        ? current.lines.map((value) => (value.variantId === id ? line : value))
        : [...current.lines, line]
      : current.lines.filter((value) => value.variantId !== id),
  };
}

export function reconcile(
  current: FormValues,
  observed: FormValues,
  incoming: FormValues,
  owned: string[],
  unresolved: Suggestions,
) {
  let values = current;
  const suggestions = { ...unresolved };
  const fields = Object.keys(incoming).filter(
    (field) => field !== 'lines' && field !== 'areaCustom',
  );
  const ids = new Set([...observed.lines, ...incoming.lines].map((line) => line.variantId));
  for (const id of ids) {
    const before = observed.lines.find((line) => line.variantId === id);
    const after = incoming.lines.find((line) => line.variantId === id);
    fields.push(
      `lines.${id}${before && after && current.lines.some((line) => line.variantId === id) ? '.quantity' : ''}`,
    );
  }
  for (const field of fields) {
    if (JSON.stringify(fieldValue(observed, field)) === JSON.stringify(fieldValue(incoming, field)))
      continue;
    const protectedField = owned.some(
      (key) =>
        key === field ||
        (field.startsWith('lines.') &&
          (key.startsWith(field + '.') || field.startsWith(key + '.'))),
    );
    delete suggestions[field];
    if (field.startsWith('lines.') && field.split('.').length === 2)
      delete suggestions[`${field}.quantity`];
    if (JSON.stringify(fieldValue(values, field)) === JSON.stringify(fieldValue(incoming, field)))
      continue;
    if (protectedField) suggestions[field] = incoming;
    else values = applyField(values, incoming, field);
  }
  return { values, suggestions };
}

export function suggestionText(values: FormValues, field: string): string {
  const value = fieldValue(values, field);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const line = value as FormLine;
    return `${line.label} × ${line.quantity}`;
  }
  return '—';
}
