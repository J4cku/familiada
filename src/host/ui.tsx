import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx, parseCount } from './util';

const DISARM_AFTER_MS = 6000;

interface ConfirmButtonProps {
  onConfirm: () => void;
  children: ReactNode;
  /** Label shown on the armed button; clicking it again confirms. */
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * Two-step inline confirmation: the first click arms the button, the second
 * one (on the same element, so focus stays put) runs the action.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Na pewno?',
  className = 'btn',
  disabled,
  title,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), DISARM_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [armed]);

  return (
    <span className="confirm">
      <button
        type="button"
        className={armed ? cx(className, 'is-armed') : className}
        disabled={disabled}
        title={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setArmed(false);
        }}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          onConfirm();
        }}
      >
        {armed ? confirmLabel : children}
      </button>
      {armed && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArmed(false)}>
          Anuluj
        </button>
      )}
    </span>
  );
}

interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
  value: number;
  onValue: (value: number) => void;
  min?: number;
  max?: number;
}

/**
 * Integer input that tolerates an empty / partial value while typing and only
 * reports valid numbers. The canonical value comes back on blur.
 */
export function NumberField({ value, onValue, min = 0, max = 99999, onBlur, ...rest }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseCount(raw);
        if (n !== null && n >= min) onValue(Math.min(n, max));
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}

interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

export function Segmented<T extends string | number>({ options, value, onChange, label, className }: SegmentedProps<T>) {
  return (
    <div className={cx('segmented', className)} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className="segmented-option"
          aria-pressed={o.value === value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
