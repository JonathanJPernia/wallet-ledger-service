'use client';

import Link from 'next/link';
import { type ReactNode, useState } from 'react';

export function FeatureCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: { label: string; href: string };
}) {
  return (
    <article className="feature-card flex flex-col">
      <h3>{title}</h3>
      <div className="flex-1">{children}</div>
      {action ? (
        <Link
          href={action.href}
          className="btn-pill btn-pill-md btn-pill-outline mt-5 w-fit"
        >
          {action.label}
        </Link>
      ) : null}
    </article>
  );
}

export function PanelCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel-card ${className}`}>
      <h2>{title}</h2>
      {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
      {children}
    </section>
  );
}

/** @deprecated Use PanelCard or FeatureCard */
export function Card({
  title,
  subtitle,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  accent?: 'brand' | 'none';
}) {
  if (!title) {
    return <div className={`panel-card ${className}`}>{children}</div>;
  }
  return (
    <PanelCard title={title} subtitle={subtitle} className={className}>
      {children}
    </PanelCard>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'solid',
  type = 'button',
  size = 'md',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'outline' | 'ghost' | 'hero' | 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
  size?: 'md' | 'lg';
}) {
  const sizeClass = size === 'lg' ? 'btn-pill-lg' : 'btn-pill-md';

  let variantClass = 'btn-pill-solid';
  if (variant === 'outline' || variant === 'secondary') variantClass = 'btn-pill-outline';
  else if (variant === 'ghost') variantClass = 'btn-pill-ghost-light';
  else if (variant === 'hero') variantClass = 'btn-pill-hero';
  else if (variant === 'danger')
    variantClass =
      'rounded-full border-2 border-red-600 bg-red-600 font-semibold text-white hover:bg-red-700';

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`btn-pill ${sizeClass} ${variantClass}`}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  hint,
  value,
  onChange,
  type = 'text',
  placeholder,
  className = '',
}: {
  label: string;
  hint?: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`flex h-full flex-col ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <span className="mb-1.5 block min-h-5 text-xs text-slate-500">
        {hint ?? '\u00a0'}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand)_22%,transparent)]"
      />
    </label>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'ok' | 'warn' | 'error' | 'neutral';
}) {
  const tones = {
    ok: 'bg-green-50 text-green-800 border-green-200',
    warn: 'bg-amber-50 text-amber-900 border-amber-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    neutral: 'bg-[var(--brand-muted)] text-[var(--brand-dark)] border-[color-mix(in_srgb,var(--brand)_25%,transparent)]',
  };
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function StepProgress({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
              active
                ? 'bg-[var(--brand-muted)] font-semibold text-[var(--brand-dark)]'
                : done
                  ? 'text-slate-500'
                  : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done || active
                  ? 'bg-[var(--brand)] text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.split(' ').slice(0, 2).join(' ')}…</span>
          </li>
        );
      })}
    </ol>
  );
}

export function VerdictBanner({
  tone,
  title,
  message,
}: {
  tone: 'ok' | 'warn' | 'error';
  title: string;
  message: string;
}) {
  const styles = {
    ok: 'border-[color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[var(--brand-muted)] text-[var(--brand-dark)]',
    warn: 'border-amber-200 bg-amber-50 text-amber-950',
    error: 'border-red-200 bg-red-50 text-red-900',
  };
  return (
    <div className={`rounded-[var(--radius-card)] border p-5 ${styles[tone]}`}>
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-relaxed opacity-90">{message}</p>
    </div>
  );
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-[var(--radius-card)] border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700"
      >
        {title}
        <span className="text-slate-400">{open ? 'Ocultar' : 'Mostrar'}</span>
      </button>
      {open ? <div className="border-t border-slate-200 p-4">{children}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="feature-card">
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs opacity-75">{hint}</p> : null}
    </div>
  );
}
