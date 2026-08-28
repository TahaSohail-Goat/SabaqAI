import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600'],
  style: ['normal', 'italic'],
});

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
    <html lang="en" suppressHydrationWarning className={fraunces.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script
          // Runs before paint to avoid a light/dark flash: mirrors the stored
          // preference (or OS preference) onto <html data-theme> immediately.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sabaqai-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-page text-navy antialiased selection:bg-brand-light selection:text-brand-dark">
        {children}
      </body>
    </html>
  );
}
