# Notifications module (M15): delivery plan and operating guide

Prepared 21 October 2026. This PR implements the in-app release below. Later phases are proposals,
not delivered features. Check `project-status.md` for the verification record.

## Goal and boundaries

Give a signed-in student one personal inbox for useful reminders from real saved activity.
The header has a bell with a preview; the sidebar has a Notifications item. Both use the same
unread count and open `/notifications`. No new backend service or dependencies are required.

Notifications never generate teaching content, call an LLM, change mastery, add study sessions,
or rearrange the revision plan. Opening a plan notification opens the existing computed plan.
General Chat and grounded Doubts retain their existing trust boundaries.

## Phase 1 — persistence and deterministic events (implemented)

Apply `supabase/migrations/0019_notifications.sql`, `0020_notification_popups.sql` and
`0021_notification_deletion.sql` before
releasing the application change. They add notifications/preferences, separate receipt time
from source event time, and persist popup preferences. Defaults enable all categories and popups.

| Category | Source | Event identity | Destination |
| --- | --- | --- | --- |
| Exam reminder | Saved `exam_plans.exam_date` | Plan id + saved exam date + days remaining | Specific saved plan |
| Revision plan saved | Persisted `exam_plans` row | Plan id | Specific saved plan |
| Quiz result available | Persisted `quiz_attempts` row and its chapter | Attempt id | Existing solved-attempt page |

- Exam reminders apply at 7, 3, 1 and 0 calendar days before the exam, in Asia/Karachi.
  Their wording reflects the student's saved exam date, not an independently confirmed board
  timetable. They expire at the end of that Pakistan calendar day.
- Saved-plan/quiz receipts are generated from the previous 14 days. They expire 30 days after
  the underlying event. A first visit can therefore include recent real activity.
- Sync considers at most the nearest 100 active plans and most recent 50 eligible attempts.
  It does not run a historical account-wide backfill.
- Scope is owner + current board + class + enrolled subjects, enforced both in source reads
  and the event builder. Switching curriculum hides earlier-scope messages.
- A unique `(user_id, event_key)` constraint and conflict-ignore inserts preserve read/archive
  state across duplicate requests and tabs. Archived messages do not reappear on refresh.
- A deleted source plan/attempt cascades to its notifications. Account deletion cascades to
  the inbox and preferences. No answer text, grading keys, audio or question history is copied.

RLS permits authenticated students to read only their own rows. Anonymous access and direct
client writes are denied. API writes use the service-role client with explicit owner and scope
filters. New SQL functions are not introduced.

**Acceptance:** test cross-account isolation, anonymous access, write grants, unique event keys,
state preservation, source/account cascades, calendar boundaries, scope and category filtering.

## Phase 2 — authenticated API and synchronization (implemented)

Shared response types live in `src/lib/types.ts`; route contracts are in `api-spec.md`.

- `GET /api/notifications`: read-only inbox/archive, global unread/archive counts, preferences,
  and 20-row pages. Supports view, category, title search and offset (see api-spec.md).
- `POST /api/notifications/sync`: find eligible persisted events and insert missing receipts.
  It accepts no user id, arbitrary message or destination from the client.
- `PATCH /api/notifications`: read, unread, archive, restore, selected-item bulk actions (up to
  50 ids), or mark all enabled inbox categories read. Restore changes only archive state.
- `PATCH /api/notifications/preferences`: persist category preferences and popup alerts.
  Disabled categories are hidden from the inbox and unread count; re-enabling them restores
  unexpired, unarchived messages and syncs any currently eligible events.

The shell syncs on mount, route navigation, focus/visibility return and every 15 seconds while
the document is visible. Successful saved-plan creation and persisted quiz grading dispatch a
shared study-event signal for immediate sync. Opening the bell and using Refresh also sync. This is in-app delivery:
no promise of background or closed-browser delivery is made. No cron job or Realtime subscription
is configured in this release.

Passive notification requests use the shared auth lookup with `refreshActivity: false`.
They validate the existing session without refreshing the app's inactivity marker. Other
callers keep the helper's existing default behavior. Timers and in-flight reads are cleaned up
on navigation/unmount; identity changes clear the previous inbox.

Missing auth returns 401; incomplete onboarding returns 403; invalid input returns 400;
an unknown/foreign notification id returns 404; missing configuration/migration and database
failures return 503 with a corrective message. An unavailable count is hidden rather than shown
as a fabricated zero. Failures do not interrupt quiz submissions, retrieval or plan creation.

**Acceptance:** owner filters on all writes, rejected forged ids/preferences, no passive
activity-cookie refresh, explicit missing-migration state, repeatable sync and no model calls.

## Phase 3 — header, sidebar and inbox (implemented)

- Header bell remains alongside Settings and theme controls. It shows a compact latest-five
  preview, unread badge, mark-all-read action, error/empty/loading states and a View all link.
  Escape closes the preview and returns focus; outside interaction closes it.
- Sidebar Notifications item is above Settings in the footer. Expanded and mobile navigation
  show the unread count; the collapsed rail has an unread indicator and accessible count label.
- `/notifications` provides All/Unread/Archived views, category and title filters, newest-first
  cards, per-item read/unread/archive/restore, selected-item read/archive/restore, undo for
  archive/restore actions, single/selected delete with confirmation, mark-all-read, preferences,
  refresh, and previous/next pagination.
- Archived updates live in the Archived tab and leave the unread badge. Their original read
  state and expiry remain intact. They can be found/restored even if a category is disabled;
  enable that category to see restored messages in the inbox. Expired messages are not shown
  in any view; physical deletion remains deferred.
- Delete is available in both inbox and archive, with an irreversible-action confirmation.
  It removes the update from all lists, badges and popups without deleting its saved plan/quiz.
  Display text is cleared; a hidden tombstone retains the event key and source/scope metadata
  to prevent recreation by sync. Direct authenticated reads also exclude deleted rows. There
  is no trash/restore path for deleted updates. Account/source cascades still remove tombstones.
- New unread receipts show bottom-right popups, up to three at a time. Initial backlog,
  repeated refreshes, restored messages and preference changes do not replay alerts. Popups
  dismiss after 12 seconds, pause while hovered/focused, and have Dismiss/Open controls.
  Dismiss leaves the update unread; Open follows the stored destination and marks it read.
  The popup preference is saved per account. Scope/account changes clear local popup state.
- Opening an item marks it read and follows its stored internal destination. The planner now
  accepts `?plan=<id>` to open that specific saved plan without changing its scheduling algorithm.
- Both surfaces share one provider. New accounts have an honest empty state. Unconfigured/demo
  sessions do not receive fake notifications. No browser-local personal inbox cache is stored.
- Use existing theme tokens and Lucide icons, visible focus, native controls, live status feedback,
  and text labels for unread state. English is the first-release UI; future Urdu text must use
  block-level RTL. Validate at 360px and desktop widths in both themes.

**Acceptance:** badges synchronize after mutations; controls survive failed requests; bell fits
on a narrow screen; full keyboard path works; deep links open real owned resources; another
account never inherits the previous inbox.

## Phase 4 — later delivery options (not implemented)

Only start these after the in-app release has been observed with real student use:

1. Extract the existing planner's schedule calculation into a shared server helper before adding
   daily study summaries. Summaries must reflect actual computed slots and must not create tasks.
2. Add student-controlled reminder timing, timezone selection, quiet hours and digest frequency.
   Review delivery/retention expectations before introducing additional personal data.
3. Add a durable outbox and a scheduled, authenticated Next.js job with idempotency, bounded
   batches and delivery-attempt records. Verify scheduler availability for the chosen hosting plan.
4. Add opt-in web push or email as separate channels with revocation/unsubscribe controls.
   Browser permission prompts and actual external delivery require a separate implementation.
5. Add Realtime only if polling latency is a demonstrated problem; retain reconnection and
   read-after-write recovery. Do not replace persistent receipts with browser-only toasts.

## Rollout and verification

1. Back up the target database and apply migrations 0019–0021 through the normal migration workflow.
   Local recovery uses `.recovery/` and must remain separate from the hosted project.
2. Run `supabase/tests/002_notifications.sql` against that environment. It rolls back all fixtures.
3. Run `npm run test:notifications`, `npm run lint`, and `npm run build`.
   For a running local app with a separate test account and an existing real quiz attempt, run
   `npm run test:notifications:e2e -- --credentials .recovery/demo-login.json`. The JSON file
   contains email/password and must remain ignored. Alternatively set NOTIFICATIONS_TEST_EMAIL
   and NOTIFICATIONS_TEST_PASSWORD. The script only accepts localhost/127.0.0.1, creates eleven
   plans to exercise pagination, restores preferences and deletes its fixtures. `--keep-fixture`
   retains plans/browser state under ignored `.recovery/` for UI checks; a normal rerun cleans them.
4. Exercise authenticated API sync, repeat sync, read/unread/archive, preferences and a second
   account. Use a real saved plan/attempt; never seed plausible student metrics into production UI.
5. Check mobile/desktop, light/dark, keyboard/Escape, polling failures and a missing migration.
6. Open the PR with the actual validation results and deployment prerequisites. Applying a local
   migration is not evidence that the hosted project has it. Deploy only after its migration exists.

Expired rows are excluded by every inbox query. Physical purging of expired receipts is deferred;
archive hides a row and preserves its deduplication key. Account deletion removes both tables'
owned rows. Monitor synchronization failures and inbox latency through existing server logs;
do not log notification bodies, credentials or private student inputs.

To roll back the UI, redeploy the previous app build. The additive tables can remain unused;
do not drop student inbox data as part of a routine application rollback.
