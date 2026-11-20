import {
  Bold,
  Italic,
  Strikethrough,
  Minus,
  Heading,
  Link2,
  Quote,
  Code,
  MessageSquare,
  Image as ImageIcon,
  Table2,
  List,
  ListOrdered,
  CheckSquare,
  HelpCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, Tooltip } from '../components/ui';

interface DescriptionEditorProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function DescriptionEditor({
  value,
  onChange,
  error,
  placeholder = 'Describe materials, fit, care instructions...',
  ...props
}: DescriptionEditorProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function insertFormatting(prefix: string, suffix: string = '', defaultText: string = '') {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + prefix + defaultText + suffix);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.substring(start, end);
    const content = selected || defaultText;
    const next = value.substring(0, start) + prefix + content + suffix + value.substring(end);
    onChange(next);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + content.length);
    }, 0);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor="product-description-editor"
          className="block text-sm font-medium text-ink-muted"
        >
          {t('editor.description')}
        </label>
        <button
          type="button"
          onClick={() => setPreview(!preview)}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-ink-muted hover:bg-panel-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-active"
        >
          {preview ? (
            <>
              <EyeOff aria-hidden className="size-3.5" />
              <span>Edit</span>
            </>
          ) : (
            <>
              <Eye aria-hidden className="size-3.5" />
              <span>Preview</span>
            </>
          )}
        </button>
      </div>

      <div
        className={cx(
          'rounded-lg border border-line bg-panel transition-colors focus-within:border-active focus-within:ring-1 focus-within:ring-active',
          error && 'border-danger-ink',
        )}
      >
        {/* Formatting Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-panel-muted/30 p-1.5 text-ink-muted">
          <ToolbarButton
            icon={Bold}
            label="Bold (**text**)"
            disabled={preview}
            onClick={() => insertFormatting('**', '**', 'bold text')}
          />
          <ToolbarButton
            icon={Italic}
            label="Italic (*text*)"
            disabled={preview}
            onClick={() => insertFormatting('*', '*', 'italic text')}
          />
          <ToolbarButton
            icon={Strikethrough}
            label="Strikethrough (~~text~~)"
            disabled={preview}
            onClick={() => insertFormatting('~~', '~~', 'strikethrough text')}
          />
          <ToolbarButton
            icon={Minus}
            label="Horizontal Rule"
            disabled={preview}
            onClick={() => insertFormatting('\n---\n')}
          />
          <ToolbarButton
            icon={Heading}
            label="Heading (### title)"
            disabled={preview}
            onClick={() => insertFormatting('### ', '\n', 'Heading')}
          />
          <ToolbarButton
            icon={Link2}
            label="Link ([text](url))"
            disabled={preview}
            onClick={() => insertFormatting('[', '](https://example.com)', 'link text')}
          />
          <ToolbarButton
            icon={Quote}
            label="Quote (> text)"
            disabled={preview}
            onClick={() => insertFormatting('> ', '\n', 'Quote text')}
          />
          <ToolbarButton
            icon={Code}
            label="Inline Code (`code`)"
            disabled={preview}
            onClick={() => insertFormatting('`', '`', 'code')}
          />
          <ToolbarButton
            icon={MessageSquare}
            label="Callout Note"
            disabled={preview}
            onClick={() => insertFormatting('> 💡 **Note:** ', '\n', 'Important product details')}
          />
          <ToolbarButton
            icon={ImageIcon}
            label="Image (![alt](url))"
            disabled={preview}
            onClick={() =>
              insertFormatting('![', '](https://example.com/image.png)', 'Image description')
            }
          />
          <ToolbarButton
            icon={Table2}
            label="Markdown Table"
            disabled={preview}
            onClick={() =>
              insertFormatting(
                '\n| Feature | Details |\n| :--- | :--- |\n| Material | Cotton |\n| Fit | Regular |\n',
              )
            }
          />

          <span className="mx-1 h-4 w-px bg-line" aria-hidden />

          <ToolbarButton
            icon={List}
            label="Bullet List (- item)"
            disabled={preview}
            onClick={() => insertFormatting('- ', '\n', 'List item')}
          />
          <ToolbarButton
            icon={ListOrdered}
            label="Numbered List (1. item)"
            disabled={preview}
            onClick={() => insertFormatting('1. ', '\n', 'List item')}
          />
          <ToolbarButton
            icon={CheckSquare}
            label="Checklist (- [ ] task)"
            disabled={preview}
            onClick={() => insertFormatting('- [ ] ', '\n', 'Feature')}
          />

          <span className="mx-1 h-4 w-px bg-line" aria-hidden />

          <Tooltip
            side="top"
            content={
              <div className="space-y-1 text-xs">
                <p className="font-semibold">Markdown formatting</p>
                <p>**bold**, *italic*, ~~strikethrough~~</p>
                <p>### Heading, - Bullet, 1. Number</p>
                <p>[link](url), ![image](url)</p>
              </div>
            }
          >
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded text-ink-faint hover:bg-panel-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-active"
              aria-label="Markdown guide"
            >
              <HelpCircle aria-hidden className="size-4" />
            </button>
          </Tooltip>
        </div>

        {/* Textarea or Preview */}
        {preview ? (
          <div className="min-h-[160px] p-4 text-sm text-ink prose max-w-none">
            {value.trim() ? (
              <SimpleMarkdownRender text={value} />
            ) : (
              <p className="text-ink-faint italic">No description written yet.</p>
            )}
          </div>
        ) : (
          <textarea
            id="product-description-editor"
            ref={textareaRef}
            rows={6}
            value={value}
            placeholder={placeholder}
            aria-label={t('editor.description')}
            onChange={(e) => onChange(e.target.value)}
            className={cx(
              'block w-full resize-y rounded-b-lg bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none',
            )}
            {...props}
          />
        )}
      </div>

      <p className="text-xs text-ink-faint">Markdown supported for headings, lists, and links.</p>
      {error && <p className="text-xs text-danger-ink">{error}</p>}
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded text-ink-muted hover:bg-panel-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-active disabled:opacity-40"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

/** Lightweight markdown renderer for the description preview without external dependencies. */
function SimpleMarkdownRender({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, idx) => {
        if (!line.trim()) return <div key={idx} className="h-2" />;
        if (line.startsWith('### ')) {
          return (
            <h3 key={idx} className="text-base font-semibold text-ink">
              {line.slice(4)}
            </h3>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h2 key={idx} className="text-lg font-bold text-ink">
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h1 key={idx} className="text-xl font-bold text-ink">
              {line.slice(2)}
            </h1>
          );
        }
        if (line.startsWith('> ')) {
          return (
            <blockquote key={idx} className="border-l-2 border-active pl-3 text-ink-muted italic">
              {line.slice(2)}
            </blockquote>
          );
        }
        if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
          const checked = line.startsWith('- [x] ');
          return (
            <div key={idx} className="flex items-center gap-2">
              <input type="checkbox" readOnly checked={checked} className="size-3.5" />
              <span>{line.slice(6)}</span>
            </div>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <li key={idx} className="ml-4 list-disc text-ink">
              {line.slice(2)}
            </li>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          const content = line.replace(/^\d+\.\s/, '');
          return (
            <li key={idx} className="ml-4 list-decimal text-ink">
              {content}
            </li>
          );
        }
        if (line === '---') {
          return <hr key={idx} className="border-line my-2" />;
        }
        return <p key={idx}>{line}</p>;
      })}
    </div>
  );
}
