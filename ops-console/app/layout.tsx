import type { Metadata } from 'next';
import './globals.css';
import { ApiConfigProvider } from '@/components/providers/ApiConfigProvider';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'Yummy — Prueba de billetera',
  description: 'Tutorial y pruebas de billetera digital. Prueba por Jonathan Pernía.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <ApiConfigProvider>
          <AppShell>{children}</AppShell>
        </ApiConfigProvider>
      </body>
    </html>
  );
}
