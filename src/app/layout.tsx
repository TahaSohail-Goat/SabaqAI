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
  title: 'SabaqAI',
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
          // preference onto <html data-theme> immediately. Light is the default
          // regardless of OS preference until a user explicitly toggles to dark.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sabaqai-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-page text-navy antialiased selection:bg-brand-light selection:text-brand-dark">
        {children}
      </body>
    </html>
  );
}
