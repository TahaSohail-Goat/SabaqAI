'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScope } from '@/components/app/ScopeContext';
import ExploreScene from '@/components/explore/ExploreScene';
import BookReaderOverlay from '@/components/explore/BookReaderOverlay';
import { ALL_SUBJECT_CODES, SUBJECT_LABELS } from '@/lib/subjects';
import type { ExploreOverviewResponse } from '@/lib/types';

export default function ExplorePage() {
  const router = useRouter();
  const { board, classLevel, setSubject, profile } = useScope();

  // Anonymous/no-profile sessions see every subject rather than collapsing to one — Explore's
  // whole point is showing multiple books, unlike Ask's single-subject `?? [subject]` fallback.
  const enrolledSubjects = profile?.subjects ?? ALL_SUBJECT_CODES;

  const [overview, setOverview] = useState<ExploreOverviewResponse | null>(null);
  const [readerSubject, setReaderSubject] = useState<string | null>(null);
  // Bumped whenever the reader closes, forcing ExploreScene to remount — the scene's flight
  // state (phase='done', frozen orbit) has no other reset path back to idle now that the page
  // stays put behind an overlay instead of navigating away.
  const [sceneResetKey, setSceneResetKey] = useState(0);

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
    const summary = overview?.subjects.find((s) => s.subjectCode === subjectCode);

    // A real textbook exists for this subject — open the whole book right here, no Doubts
    // detour. Falls back to Doubts only when there's genuinely no book to open (a subject with
    // only a model paper ingested so far) — Doubts can still ground answers in that.
    if (summary?.hasTextbook) {
      setReaderSubject(subjectCode);
      return;
    }
    router.push('/doubts');
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-2">
        Drag to look around, scroll to zoom, click a book to open it. Tab into the scene for a
        keyboard-accessible list of subjects instead.
      </p>
      <ExploreScene key={sceneResetKey} enrolledSubjects={enrolledSubjects} overview={overview} onArrived={handleArrived} />

      {readerSubject && (
        <BookReaderOverlay
          subjectCode={readerSubject}
          subjectLabel={SUBJECT_LABELS[readerSubject] ?? readerSubject}
          board={board}
          classLevel={classLevel}
          onClose={() => {
            setReaderSubject(null);
            setSceneResetKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
