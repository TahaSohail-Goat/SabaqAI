import { redirect } from 'next/navigation';

// The old single-page app (Ask/Quiz/Eval/Syllabus as useState tabs) lives now as separate
// routed pages under (app)/ — see docs/modules.md §2.3. This root just sends visitors to
// the landing page of that shell. No client JS, no auth check, no flicker.
export default function Home() {
  redirect('/dashboard');
}
