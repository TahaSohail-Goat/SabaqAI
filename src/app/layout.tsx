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
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className="min-h-screen bg-page text-navy antialiased selection:bg-brand-light selection:text-brand-dark">
        {children}
      </body>
    </html>
  );
}
