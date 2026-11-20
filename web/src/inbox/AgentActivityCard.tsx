import { AlertTriangle, Check, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { components } from '../api/schema';
import { ActionButton, cx } from '../components/ui';

export type AgentActivity = components['schemas']['AgentActivityRead'];
export type AgentStep = AgentActivity['phase'];

const FINISHED = new Set<AgentStep>(['skipped', 'failed']);
/** Like the server's `STALE_AFTER`: a working step that has not moved for this long is a dead run. */
export const STALE_MS = 180_000;

export function isWorking(activity: Pick<AgentActivity, 'phase'> | null | undefined): boolean {
  return !!activity && !FINISHED.has(activity.phase);
}

/**
 * What the AI is doing in this conversation, where its draft will appear. While it
 * works: the steps so far and the one it is on, with how long it has been. When it finished
 * without a draft: why, and for a failure a Try again that asks for a new draft. `compact` is the
 * one-line form shown above a draft that is still pending while a newer run works. A working step
 * that stopped moving (`updatedAt` older than `STALE_MS`: the worker died) shows nothing.
 */
export function AgentActivityCard({
  step,
  reason = null,
  startedAt = null,
  updatedAt = null,
  compact = false,
  canRetry = false,
  onRetry,
}: {
  step: AgentStep;
  reason?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  compact?: boolean;
  canRetry?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const trail = useTrail(step, startedAt);
  const working = !FINISHED.has(step);
  const now = useNow(working);

  if (step === 'skipped' || step === 'failed') {
    const failed = step === 'failed';
    return (
      <section
        aria-label={t('inbox.activity.title')}
        className={cx(
          'rounded-lg border px-3 py-2.5 text-sm',
          failed ? 'border-warn-ink/25 bg-warn/60' : 'border-line bg-panel-muted',
        )}
      >
        <h3
          className={cx(
            'flex items-center gap-1.5 text-xs font-semibold',
            failed ? 'text-warn-ink' : 'text-ink-muted',
          )}
        >
          <AlertTriangle aria-hidden className="size-3.5" />
          {t(failed ? 'inbox.activity.failed' : 'inbox.activity.skipped')}
        </h3>
        <p role="status" className="mt-1.5 text-ink-muted">
          {t(`inbox.activity.reason.${reason ?? 'error'}`, {
            defaultValue: t('inbox.activity.reason.error'),
          })}
        </p>
        {failed && onRetry && (
          <div className="mt-2.5">
            <ActionButton
              size="sm"
              tone="primary"
              icon={RotateCcw}
              disabled={!canRetry}
              onClick={onRetry}
            >
              {t('inbox.activity.retry')}
            </ActionButton>
          </div>
        )}
      </section>
    );
  }

  if (updatedAt && now - Date.parse(updatedAt) > STALE_MS) return null;
  const seconds = startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : 0;
  const current = t(`inbox.activity.step.${step}`);
  const elapsed = seconds >= 3 ? t('inbox.activity.elapsed', { seconds }) : null;

  if (compact) {
    return (
      <p
        role="status"
        aria-busy="true"
        className="flex items-center gap-1.5 px-1 text-xs font-medium text-ai-ink"
      >
        <Sparkles aria-hidden className="size-3.5 animate-pulse" />
        {current}
        {elapsed && <span className="tabular-nums text-ink-faint">{elapsed}</span>}
      </p>
    );
  }

  return (
    <section
      aria-label={t('inbox.activity.title')}
      aria-busy="true"
      className="rounded-lg border border-ai-ink/25 bg-ai/60 px-3 py-2.5 text-sm"
    >
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ai-ink">
        <Sparkles aria-hidden className="size-3.5 animate-pulse" />
        {t('inbox.activity.title')}
        {elapsed && (
          <span className="ml-auto tabular-nums font-normal text-ink-faint">{elapsed}</span>
        )}
      </h3>
      <ol className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {trail.slice(0, -1).map((done) => (
          <li key={done} className="flex items-center gap-1 text-xs text-ink-faint">
            <Check aria-hidden className="size-3" />
            {/* Done: the step without its "still going" ellipsis. */}
            {t(`inbox.activity.step.${done}`).replace(/…$/, '')}
          </li>
        ))}
        <li role="status" className="text-ink-muted">
          {current}
        </li>
      </ol>
    </section>
  );
}

/**
 * The steps this run went through, in order, as seen by this tab; a new run starts a new trail.
 * Updated during render, not in an effect, so a new step never shows for a frame without the one
 * before it.
 */
function useTrail(step: AgentStep, startedAt: string | null): AgentStep[] {
  const [trail, setTrail] = useState<{ run: string | null; steps: AgentStep[] }>({
    run: startedAt,
    steps: [step],
  });
  if (trail.run === startedAt && trail.steps.at(-1) === step) return trail.steps;
  const before = trail.run === startedAt ? trail.steps : [];
  // `queued` and `retrying` are waiting, not progress: they never stay in the trail.
  const kept = before.filter((s) => s !== step && s !== 'queued' && s !== 'retrying');
  const next = { run: startedAt, steps: [...kept, step] };
  setTrail(next);
  return next.steps;
}

/** The time, ticking every second while `running`. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}
