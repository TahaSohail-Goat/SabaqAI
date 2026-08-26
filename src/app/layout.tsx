import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sabaq AI — Syllabus-Grounded Pakistani Board Tutor',
  description: 'AI tutor grounded in verified PCTB textbooks with confidence guardrails, page citations, and adaptive quizzes.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        {children}
      </body>
    </html>
  );
}
