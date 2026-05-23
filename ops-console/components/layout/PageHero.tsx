import Link from 'next/link';
import { type ReactNode } from 'react';

type Action = {
  label: string;
  href: string;
  variant?: 'hero' | 'solid' | 'outline';
};

export function PageHero({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: Action[];
  children?: ReactNode;
}) {
  return (
    <section className="hero-block">
      <h1>{title}</h1>
      <p>{description}</p>
      {actions && actions.length > 0 ? (
        <div className="hero-actions">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`btn-pill btn-pill-lg ${
                action.variant === 'solid'
                  ? 'btn-pill-solid !border-white !bg-white !text-[var(--brand)] hover:!bg-white/90'
                  : 'btn-pill-hero'
              }`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  );
}
