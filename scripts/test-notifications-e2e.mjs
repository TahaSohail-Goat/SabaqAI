// Local integration check: uses real auth/API routes and cleans up its saved plans.
// node scripts/test-notifications-e2e.mjs --credentials .recovery/demo-login.json
// Add --keep-fixture only for a subsequent interactive browser check; rerun normally to clean it.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.NOTIFICATIONS_TEST_BASE_URL ?? 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a separate local test database, not a hosted student account.');
const credentialIndex = process.argv.indexOf('--credentials');
const credentials = credentialIndex >= 0
  ? JSON.parse(fs.readFileSync(process.argv[credentialIndex + 1], 'utf8').replace(/^\uFEFF/, ''))
  : { email: process.env.NOTIFICATIONS_TEST_EMAIL, password: process.env.NOTIFICATIONS_TEST_PASSWORD };
assert.ok(credentials.email && credentials.password, 'Supply --credentials <private JSON file> or NOTIFICATIONS_TEST_EMAIL/PASSWORD.');
const keep = process.argv.includes('--keep-fixture');
const jar = new Map();
const plans = [];
let savedPreferences;
let passed = false;
async function request(path, method = 'GET', body, authenticated = true) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(authenticated ? { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0]; const index = pair.indexOf('=');
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const content = await response.text();
  return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(content) : content };
}
async function ok(path, method = 'GET', body) {
  const result = await request(path, method, body);
  assert.equal(result.status, 200, `${method} ${path}: ${typeof result.body === 'object' ? result.body.error : result.status}`);
  return result.body;
}
async function all(view = 'inbox') {
  const items = [];
  for (let offset = 0; ; offset += 20) {
    const data = await ok(`/api/notifications?view=${view}&offset=${offset}`);
    items.push(...data.items);
    if (!data.hasMore) return items;
    assert.ok(offset < 2000, 'Unexpected inbox size for local test account.');
  }
}

try {
  for (const [path, method, body] of [['/api/notifications', 'GET'], ['/api/notifications/sync', 'POST'], ['/api/notifications', 'PATCH', { action: 'mark_all_read' }], ['/api/notifications/preferences', 'PATCH', {}]]) {
    assert.equal((await request(path, method, body, false)).status, 401);
  }
  const login = await ok('/api/auth/login', 'POST', credentials);
  assert.equal(login.success, true); assert.notEqual(login.isDemo, true);
  fs.mkdirSync('.recovery', { recursive: true });
  const fixturePath = '.recovery/notifications-e2e-fixture.json';
  if (fs.existsSync(fixturePath)) {
    const previous = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    for (const id of previous.planIds ?? []) await request(`/api/dashboard/plan/${id}`, 'DELETE');
    if (previous.savedPreferences) await ok('/api/notifications/preferences', 'PATCH', previous.savedPreferences);
    fs.unlinkSync(fixturePath);
  }
  savedPreferences = (await ok('/api/notifications')).preferences;
  await ok('/api/notifications/preferences', 'PATCH', { examReminders: true, planUpdates: true, quizResults: true, popups: true });
  const { profile } = await ok('/api/auth/user');
  const subject = profile.subjects.includes('physics') ? 'physics' : profile.subjects[0];
  const params = new URLSearchParams({ board: profile.board, classLevel: String(profile.classLevel), subject });
  const { chapters } = await ok(`/api/quiz/scope?${params}`);
  assert.ok(chapters.length);
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86_400_000));
  for (let i = 0; i < 11; i++) {
    const created = await ok('/api/dashboard/plan', 'POST', { subject, fromChapterNo: chapters[0].chapterNo, toChapterNo: chapters[0].chapterNo, examDate: tomorrow, reserveBufferDay: true });
    plans.push(created.id);
  }
  const scheduleBefore = await ok(`/api/dashboard/plan/${plans[0]}`);
  const activityBefore = jar.get('sabaqai-active');
  await ok('/api/notifications/sync', 'POST');
  const initial = await ok('/api/notifications');
  assert.equal(initial.items.length, 20); assert.equal(initial.hasMore, true);
  const items = await all();
  assert.equal(new Set(items.map(item => item.id)).size, items.length, 'Pagination duplicated messages.');
  const fixture = items.filter(item => plans.some(id => item.href.includes(id)));
  assert.equal(fixture.length, 22);
  await ok('/api/notifications/sync', 'POST');
  assert.equal((await all()).length, items.length, 'Repeated sync duplicated receipts.');
  const id = fixture[0].id;
  await ok('/api/notifications', 'PATCH', { action: 'read', id });
  const readAt = (await all()).find(item => item.id === id).readAt;
  assert.ok(readAt);
  await ok('/api/notifications', 'PATCH', { action: 'archive', id });
  assert.ok(!(await all()).some(item => item.id === id));
  assert.ok((await all('archived')).some(item => item.id === id));
  await ok('/api/notifications/sync', 'POST');
  assert.ok(!(await all()).some(item => item.id === id), 'Sync resurrected an archive.');
  await ok('/api/notifications/preferences', 'PATCH', { examReminders: false, planUpdates: false, quizResults: false, popups: false });
  const paused = await ok('/api/notifications');
  assert.equal(paused.unreadCount, 0); assert.equal(paused.totalCount, 0); assert.ok(paused.archivedCount > 0);
  assert.ok((await all('archived')).some(item => item.id === id), 'Disabled category hid the archive.');
  await ok('/api/notifications', 'PATCH', { action: 'restore', id });
  await ok('/api/notifications/preferences', 'PATCH', { examReminders: true, planUpdates: true, quizResults: true, popups: true });
  assert.equal((await all()).find(item => item.id === id).readAt, readAt, 'Restore changed read status.');
  await ok('/api/notifications', 'PATCH', { action: 'unread', id });
  assert.ok((await all('unread')).some(item => item.id === id));
  const ids = fixture.slice(0, 3).map(item => item.id);
  await ok('/api/notifications', 'PATCH', { action: 'read_many', ids });
  assert.ok((await all()).filter(item => ids.includes(item.id)).every(item => item.readAt));
  await ok('/api/notifications', 'PATCH', { action: 'archive_many', ids });
  assert.equal((await all('archived')).filter(item => ids.includes(item.id)).length, 3);
  await ok('/api/notifications', 'PATCH', { action: 'restore_many', ids });
  assert.equal((await all()).filter(item => ids.includes(item.id)).length, 3);
  const filtered = await ok('/api/notifications?kind=exam_reminder&q=exam');
  assert.ok(filtered.items.length); assert.ok(filtered.items.every(item => item.kind === 'exam_reminder' && /exam/i.test(item.title)));
  assert.equal((await ok('/api/notifications?q=%25')).totalCount, 0, 'Search treated percent as a wildcard.');
  for (const path of ['/api/notifications?offset=-1', '/api/notifications?view=deleted', '/api/notifications?kind=invalid', '/api/notifications?view=archived&unread=true']) assert.equal((await request(path)).status, 400);
  for (const body of [{ action: 'read', id, user_id: randomUUID() }, { action: 'archive_many', ids: [] }]) assert.equal((await request('/api/notifications', 'PATCH', body)).status, 400);
  assert.equal((await request('/api/notifications', 'PATCH', { action: 'restore', id: randomUUID() })).status, 404);
  assert.equal(jar.get('sabaqai-active'), activityBefore, 'Passive requests extended the inactivity session.');
  assert.deepEqual((await ok(`/api/dashboard/plan/${plans[0]}`)).days, scheduleBefore.days, 'Notification actions changed the computed schedule.');
  for (const path of ['/notifications', `/dashboard/plan?plan=${plans[0]}`, '/quiz/history']) assert.equal((await request(path)).status, 200);
  const history = await ok('/api/quiz/history');
  assert.ok(history.attempts.length, 'Local fixture account needs a real saved quiz attempt for the destination test.');
  const attemptId = history.attempts[0].id;
  await ok(`/api/quiz/history/${attemptId}`);
  assert.equal((await request(`/quiz/history/${attemptId}`)).status, 200);
  // Delete from both archive and inbox; preserve source plans and deduplication across sync.
  await ok('/api/notifications', 'PATCH', { action: 'archive', id: ids[0] });
  await ok('/api/notifications', 'PATCH', { action: 'delete', id: ids[0] });
  await ok('/api/notifications', 'PATCH', { action: 'delete_many', ids: ids.slice(1) });
  await ok('/api/notifications/sync', 'POST');
  for (const view of ['inbox', 'unread', 'archived']) {
    assert.ok(!(await all(view)).some(item => ids.includes(item.id)), 'Deleted message reappeared in ' + view);
  }
  for (const action of ['restore', 'read', 'archive', 'delete']) assert.equal((await request('/api/notifications', 'PATCH', { action, id: ids[0] })).status, 404);
  assert.equal((await request('/api/notifications', 'PATCH', { action: 'delete', id: ids[0], user_id: randomUUID() })).status, 400);
  assert.equal((await request('/api/notifications', 'PATCH', { action: 'delete_many', ids: [] })).status, 400);
  assert.deepEqual((await ok(`/api/dashboard/plan/${plans[0]}`)).days, scheduleBefore.days, 'Deleting notifications changed the source plan.');
  passed = true;
  if (keep) {
    fs.writeFileSync(fixturePath, JSON.stringify({ planIds: plans, savedPreferences, attemptId }));
    fs.writeFileSync('.recovery/notifications-browser-state.json', JSON.stringify({ cookies: [...jar].map(([name, value]) => ({ name, value, domain: new URL(base).hostname, path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' })), origins: [] }));
  }
  console.log('PASS: real-auth routes, pagination, deduplication, archive/restore/read status, disabled-category archive, bulk actions, search/filter validation, unchanged schedule/session, plan/quiz destinations, and deletion surviving sync without removing source plans.');
} finally {
  if (!keep || !passed) {
    for (const id of plans) await request(`/api/dashboard/plan/${id}`, 'DELETE');
    if (savedPreferences) await ok('/api/notifications/preferences', 'PATCH', savedPreferences);
    console.log('Local integration fixtures cleaned up.');
  }
}
