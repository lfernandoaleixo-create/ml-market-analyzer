import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { parseLocalized } from "@shared/alpha/pricing";

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  optional,
  readOnly = false,
  required = false,
  invalid = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  optional?: string;
  readOnly?: boolean;
  required?: boolean;
  invalid?: boolean;
}) {
  const focused = useRef(false);
  const format = (n: number) =>
    Number.isFinite(n) ? String(n).replace(".", ",") : "";
  const [draft, setDraft] = useState(format(value));
  useEffect(() => {
    if (!focused.current) setDraft(format(value));
  }, [value]);
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 font-bold text-[#cb4055]">
            *
          </span>
        )}
        {optional && <span className="optional">{optional}</span>}
      </span>
      <div className="field-control">
        {prefix && <span className="field-prefix">{prefix}</span>}
        <input
          aria-label={label}
          inputMode="decimal"
          type="text"
          value={draft}
          readOnly={readOnly}
          required={required}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          className={`${prefix ? "with-prefix" : ""} ${suffix ? "with-suffix" : ""} ${invalid ? "field-input-invalid" : ""}`}
          onFocus={() => (focused.current = true)}
          onChange={e => {
            if (readOnly) return;
            setDraft(e.target.value);
            const n = parseLocalized(e.target.value);
            onChange(Number.isFinite(n) ? n : NaN);
          }}
          onBlur={() => {
            focused.current = false;
            setDraft(format(value));
          }}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </label>
  );
}
export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <div className="field-hint">{hint}</div>}
    </label>
  );
}
export function Panel({
  number,
  title,
  children,
  trailing,
}: {
  number: string;
  title: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <span className="section-no">{number}</span>
        <h2>{title}</h2>
        {trailing && <div className="trailing">{trailing}</div>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
export function Segment({
  value,
  onChange,
  options,
  compact = false,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
  label: string;
}) {
  return (
    <div
      className={`segment ${compact ? "compact" : ""}`}
      role="group"
      aria-label={label}
    >
      {options.map(o => (
        <button
          key={o.value}
          className={value === o.value ? "active" : ""}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button,a[href],input,select,[tabindex="0"]'
          ) ?? []
        );
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button aria-label="Fechar" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
