'use client';

import React, { useEffect, useState } from 'react';
import {
  Search,
  Award,
  BookOpen,
  MessagesSquare,
  ListChecks,
  TrendingUp,
  History,
} from 'lucide-react';
import { useScope } from '@/components/app/ScopeContext';
import ActionCard from '@/components/app/ActionCard';
import StatCard from '@/components/app/StatCard';
import EmptyState from '@/components/app/EmptyState';
import SectionHeader from '@/components/app/SectionHeader';
import Badge from '@/components/app/Badge';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ACTIONS = [
  {
    href: '/ask',
    icon: Search,
    title: 'Ask a question',
    description: 'Get a grounded, cited answer — or an honest refusal.',
    variant: 'primary' as const,
  },
  {
    href: '/quiz',
    icon: Award,
    title: 'Take a quiz',
    description: 'Board-pattern questions generated from your chapters.',
    variant: 'secondary' as const,
  },
  {
    href: '/syllabus',
    icon: BookOpen,
    title: 'Browse syllabus',
    description: 'See exactly what Sabaq AI has ingested so far.',
    variant: 'secondary' as const,
  },
];

export default function DashboardPage() {
  // user/profile come from ScopeContext, which the (app) layout resolves server-side before
  // this page ever renders — so the real name/board/class/subjects are already here on
  // first paint, no client fetch, no loading flash.
  const { board, classLevel, subject, user, profile } = useScope();

  // "—" while loading/unknown, a real number once fetched — even 0 is a genuine count now
  // (qa_log/quiz_attempts are both actually written to, see /api/ask and /api/quiz), not a
  // guess. Asserting "0" before this resolves would still be the invariant-7 violation the
  // original placeholder comment here was written to avoid.
  const [activityStats, setActivityStats] = useState<{ questionsAsked: number; quizzesTaken: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard/stats')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setActivityStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const STATS = [
    {
      icon: MessagesSquare,
      label: 'Questions asked',
      value: activityStats ? String(activityStats.questionsAsked) : '—',
      hint: activityStats?.questionsAsked === 0 ? 'Ask your first question to start tracking.' : undefined,
    },
    {
      icon: ListChecks,
      label: 'Quizzes taken',
      value: activityStats ? String(activityStats.quizzesTaken) : '—',
      hint: activityStats?.quizzesTaken === 0 ? 'Scores will appear here once you submit one.' : undefined,
    },
  ];

  const firstName = user?.metadata?.full_name?.split(' ')[0];
  // A signed-in student is enrolled in every seeded subject by default (create-account.ts),
  // not just the single "active" one ScopeContext tracks for Ask/Quiz — show the real list
  // here instead of implying they only study one subject. Falls back to the scope default
  // for anonymous/demo sessions, which have no real profile to read from.
  const subjectsLabel = profile?.subjects?.length
    ? profile.subjects.map(titleCase).join(', ')
    : titleCase(subject);

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* Welcome */}
      <div className="animate-fade-up">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-navy">
          {firstName ? `Welcome back, ${firstName}.` : 'Welcome back.'}
        </h2>
        <Badge variant="context" className="mt-3">
          {board} · Class {classLevel} · {subjectsLabel}
        </Badge>
      </div>

      {/* Primary actions */}
      <div className="space-y-4">
        <SectionHeader title="What do you want to do?" subtitle="Ask a question is the fastest way to check your work." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ACTIONS.map((action, i) => (
            <ActionCard
              key={action.href}
              href={action.href}
              icon={action.icon}
              title={action.title}
              description={action.description}
              variant={action.variant}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-4">
        <SectionHeader title="Your activity" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STATS.map((stat) => (
            <StatCard key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} hint={stat.hint} />
          ))}
        </div>
      </div>

      {/* Weakest chapters / recent activity */}
      <div className="space-y-4">
        <SectionHeader title="Insights" subtitle="Fills in automatically as you use Sabaq AI." />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EmptyState
            icon={TrendingUp}
            title="No weak chapters yet"
            message="Take a quiz and this will show which chapters need more work, ranked by your actual scores."
            ctaLabel="Take a quiz"
            ctaHref="/quiz"
          />
          <EmptyState
            icon={History}
            title="No recent activity"
            message="Questions you ask and quizzes you take will show up here."
            ctaLabel="Ask a question"
            ctaHref="/ask"
          />
        </div>
      </div>
    </div>
  );
}
