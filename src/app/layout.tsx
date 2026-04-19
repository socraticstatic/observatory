import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Observatory — Personal AI Observability',
  description: 'Token spend diagnostics across LLM providers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
