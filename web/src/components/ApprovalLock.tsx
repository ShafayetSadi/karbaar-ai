import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from './ui';

/** The line under a locked action: "Available after your shop is approved". */
export function ApprovalLock({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs text-ink-faint', className)}>
      <Lock aria-hidden="true" className="size-3" />
      {t('approval.locked')}
    </span>
  );
}
