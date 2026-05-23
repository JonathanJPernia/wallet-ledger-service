'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useApiConfig } from '@/components/providers/ApiConfigProvider';
import { Button, Input } from '@/components/ui/Primitives';

const NAV = [
  { href: '/', label: 'Inicio' },
  { href: '/tutorial', label: 'Tutorial' },
  { href: '/stress', label: 'Pruebas de estrés' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { config, setBaseUrl, reset } = useApiConfig();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-6 px-4 py-5">
          <Link href="/" className="shrink-0">
            <Image
              src="/yummy-logo.png"
              alt="Yummy"
              width={130}
              height={44}
              className="h-10 w-auto object-contain"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-6 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  pathname === item.href ? 'nav-link nav-link-active' : 'nav-link'
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="btn-pill btn-pill-md btn-pill-outline shrink-0"
          >
            Conexión
          </button>
        </div>

        <nav className="mx-auto flex max-w-4xl gap-2 border-t border-[var(--border)] px-4 py-2 sm:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 text-center text-sm font-semibold py-2 rounded-lg ${
                pathname === item.href
                  ? 'bg-[var(--brand-muted)] text-[var(--brand)]'
                  : 'text-slate-600'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {settingsOpen ? (
          <div className="border-t border-[var(--border)] bg-[var(--brand-muted)] px-4 py-5">
            <div className="mx-auto max-w-4xl space-y-4 panel-card">
              <h2 className="text-base font-bold text-[var(--brand-dark)]">
                Conexión al servidor
              </h2>
              <Input
                label="Dirección del servidor"
                hint="URL de Railway, sin /api al final"
                value={config.baseUrl}
                onChange={setBaseUrl}
                placeholder="https://tu-servicio.up.railway.app"
              />
              <Button variant="outline" onClick={reset}>
                Restaurar predeterminado
              </Button>
              <p className="text-xs text-slate-600 leading-relaxed">
                Si no carga, agrega esta página a <strong>CORS_ORIGINS</strong> en Railway
                (ej. http://localhost:3001).
              </p>
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:py-10">{children}</main>

      <footer className="mx-auto max-w-4xl space-y-1 border-t border-[var(--border)] px-4 py-8 text-center text-xs text-slate-500">
        <p>
          Prueba hecha por{' '}
          <strong className="font-semibold text-[var(--brand)]">Jonathan Pernía</strong>
        </p>
        <p className="text-slate-400">
          Las operaciones crean datos reales en el servidor configurado.
        </p>
      </footer>
    </div>
  );
}
