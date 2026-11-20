import type { components } from '../api/schema';

type AiSettings = components['schemas']['AiSettingsRead'];

/** What the sales agent does for this shop right now: nothing, draft for approval, or answer. */
export type EffectiveAiMode = 'off' | 'draft' | 'auto';

/**
 * The shop's saved AI mode as it applies today. The AI is off when the plan has no AI drafting or
 * the mode is off, and Auto only counts once the shop has been granted it; until then it drafts.
 */
export function effectiveAiMode(
  aiAvailable: boolean,
  settings: Pick<AiSettings, 'ai_mode' | 'auto_mode_available'>,
): EffectiveAiMode {
  if (!aiAvailable || settings.ai_mode === 'off') return 'off';
  return settings.ai_mode === 'auto' && settings.auto_mode_available ? 'auto' : 'draft';
}
