import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { FIELD_CONTROL } from './styles';

interface FieldFrameProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** A label, optional hint and error text, wired to the control with aria-describedby. */
function FieldFrame({ id, label, hint, error, children }: FieldFrameProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-2">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-critical-text">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [error ? `${id}-error` : hint ? `${id}-hint` : undefined].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, id, ...rest }: TextFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error}>
      <input
        id={fieldId}
        className={FIELD_CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...rest}
      />
    </FieldFrame>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextAreaField({ label, hint, error, id, ...rest }: TextAreaFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error}>
      <textarea
        id={fieldId}
        className={`${FIELD_CONTROL} min-h-28 resize-y`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...rest}
      />
    </FieldFrame>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function SelectField({ label, hint, error, id, children, ...rest }: SelectFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error}>
      <select
        id={fieldId}
        className={FIELD_CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...rest}
      >
        {children}
      </select>
    </FieldFrame>
  );
}
