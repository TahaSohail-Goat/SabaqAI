'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScope } from '@/components/app/ScopeContext';
import ExploreScene from '@/components/explore/ExploreScene';
import { ALL_SUBJECT_CODES } from '@/lib/subjects';
import type { ExploreOverviewResponse } from '@/lib/types';

export default function ExplorePage() {
  const router = useRouter();
  const { board, classLevel, setSubject, profile } = useScope();

  // Anonymous/no-profile sessions see every subject rather than collapsing to one — Explore's
  // whole point is showing multiple books, unlike Ask's single-subject `?? [subject]` fallback.
  const enrolledSubjects = profile?.subjects ?? ALL_SUBJECT_CODES;

  const [overview, setOverview] = useState<ExploreOverviewResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/explore/overview?board=${encodeURIComponent(board)}&classLevel=${classLevel}`)
      .then((res) => res.json())
      .then((data: ExploreOverviewResponse) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [board, classLevel]);

  const handleArrived = (subjectCode: string) => {
    setSubject(subjectCode);
    router.push('/ask');
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-2">
        Drag to look around, scroll to zoom, click a book to open it. Tab into the scene for a
        keyboard-accessible list of subjects instead.
      </p>
      <ExploreScene enrolledSubjects={enrolledSubjects} overview={overview} onArrived={handleArrived} />
    </div>
  );
}
