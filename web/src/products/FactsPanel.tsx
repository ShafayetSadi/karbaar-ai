import { useTranslation } from 'react-i18next';
import { ActionButton, Field } from '../components/ui';
import type { FactDraft } from './options';

const MAX_FACTS = 20;

export interface FactsPanelProps {
  facts: FactDraft[];
  onChange: (facts: FactDraft[]) => void;
  /** Labels the product type suggests; shown as chips until used. */
  suggestions: string[];
  disabled?: boolean;
}

/** Ordered label/value pairs (brand, origin, warranty…). State lives in the parent form. */
export function FactsPanel({ facts, onChange, suggestions, disabled }: FactsPanelProps) {
  const { t } = useTranslation();
  const used = new Set(facts.map((f) => f.label.trim().toLowerCase()));
  const unused = suggestions.filter((label) => !used.has(label.toLowerCase()));
  const atLimit = facts.length >= MAX_FACTS;

  const set = (index: number, patch: Partial<FactDraft>) =>
    onChange(facts.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const move = (index: number, by: -1 | 1) => {
    const a = facts[index];
    const b = facts[index + by];
    if (!a || !b) return;
    onChange(facts.map((f, i) => (i === index ? b : i === index + by ? a : f)));
  };

  return (
    <>
      {facts.map((fact, index) => (
        <div key={index} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <Field
            label={t('editor.factLabel')}
            value={fact.label}
            maxLength={40}
            onChange={(e) => set(index, { label: e.target.value })}
          />
          <Field
            label={t('editor.factValue', { name: fact.label || t('editor.factLabel') })}
            value={fact.value}
            maxLength={300}
            onChange={(e) => set(index, { value: e.target.value })}
          />
          <span className="flex gap-2">
            <ActionButton disabled={disabled || index === 0} onClick={() => move(index, -1)}>
              {t('editor.moveUp')}
            </ActionButton>
            <ActionButton
              disabled={disabled || index === facts.length - 1}
              onClick={() => move(index, 1)}
            >
              {t('editor.moveDown')}
            </ActionButton>
            <ActionButton
              tone="danger"
              disabled={disabled}
              onClick={() => onChange(facts.filter((_, i) => i !== index))}
            >
              {t('editor.removeFact')}
            </ActionButton>
          </span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {unused.map((label) => (
          <ActionButton
            key={label}
            disabled={disabled || atLimit}
            onClick={() => onChange([...facts, { label, value: '' }])}
          >
            + {label}
          </ActionButton>
        ))}
        <ActionButton
          disabled={disabled || atLimit}
          onClick={() => onChange([...facts, { label: '', value: '' }])}
        >
          {t('editor.addFact')}
        </ActionButton>
      </div>
    </>
  );
}
