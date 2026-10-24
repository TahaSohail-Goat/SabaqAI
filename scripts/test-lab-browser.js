// Execute with playwright-cli run-code --filename scripts/test-lab-browser.js after
// loading .recovery/lab-browser-state.json. Auth/evidence/calculation routes are real local
// services. Only AI responses and intentional network failures below are fixtures.
async (page) => {
  const ensure = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  let aiFixtures = 0, failNextRun = false, staleProposal = false, droppedRequest = null;
  await page.route('**/api/lab', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const request = route.request().postDataJSON();
    if (request.action === 'run' && failNextRun) {
      failNextRun = false;
      const committed = await route.fetch(); ensure(committed.status() === 200, 'Lost-response fixture did not commit its server run.');
      droppedRequest = request.requestId; return route.abort('failed');
    }
    if (request.action === 'run' && droppedRequest) { ensure(request.requestId === droppedRequest, 'Retry after lost response did not reuse the request ID.'); droppedRequest = null; }
    if (request.action === 'propose' && staleProposal) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      try { await route.fulfill({ json: { status: 'proposal', requestId: request.requestId, inputVersion: request.inputVersion,
        input: { experimentId: 'uniform', parameters: { x0: { value: 0, unit: 'm' }, u: { value: 4, unit: 'm/s' }, duration: { value: 5, unit: 's' } } }, suggestedKeys: ['x0', 'u', 'duration'] } }); } catch {}
      return;
    }
    if (request.action !== 'explain') return route.continue();
    aiFixtures++;
    const proof = JSON.parse(Buffer.from(request.runToken.split('.')[0], 'base64url').toString('utf8'));
    const id = proof.input.experimentId, p = proof.input.parameters;
    const turning = id === 'acceleration' && p.a.value !== 0 && -p.u.value / p.a.value > 0 && -p.u.value / p.a.value < p.duration.value;
    return route.fulfill({ json: { status: 'feedback', requestId: request.requestId, inputVersion: request.inputVersion, runId: proof.id,
      guidance: { personalized: false, message: 'Reviewed explanation · browser fixture (AI not contacted).', blocks: [id, ...(turning ? ['turning'] : [])],
        observations: [{ runId: proof.id, field: 'distance' }], followupId: id === 'uniform' ? 'change-speed' : id === 'journey' ? 'change-return' : 'change-acceleration' } } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://localhost:3000/concept-lab');
  const confirm = () => page.getByRole('checkbox', { name: 'I confirm these settings and the model assumptions.' });
  const predict = () => page.locator('#lab-prediction');
  const results = () => page.getByRole('region', { name: 'Calculated results' });
  const row = (name) => results().getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
  await page.getByRole('button', { name: /01 · Uniform motion/ }).waitFor();
  ensure((await page.getByRole('spinbutton', { name: 'Velocity', exact: true }).boundingBox()).width > 80, 'Numeric input collapsed behind units.');
  ensure(await page.getByRole('button', { name: 'Test my prediction', exact: true }).isDisabled(), 'Guided run must require prediction and confirmation.');
  await page.getByRole('combobox', { name: 'Velocity unit', exact: true }).selectOption('km/h');
  ensure(Math.abs(Number(await page.locator('#lab-u').inputValue()) - 14.4) < 1e-8, 'Unit switch changed SI velocity.');
  await page.getByRole('combobox', { name: 'Velocity unit', exact: true }).selectOption('m/s');
  await page.getByRole('textbox', { name: 'Start with a question' }).fill('How far at constant velocity?');
  await page.locator('#lab-reasoning').fill('I expect distance to grow steadily.');
  await confirm().check(); await predict().fill('20'); await page.getByRole('button', { name: 'Test my prediction', exact: true }).click();
  await results().waitFor(); await page.getByText(/browser fixture/).waitFor();
  ensure((await row('Total distance (m)').innerText()).includes('20'), 'Uniform distance was not 20 m.');
  ensure(await page.getByRole('slider', { name: 'Simulation time' }).inputValue() === '0', 'Reduced motion must not autoplay.');
  await page.getByRole('button', { name: 'Play animation' }).click();
  await page.waitForFunction(() => Number(document.querySelector('#lab-clock').value) > 0.15);
  await page.getByRole('button', { name: 'Pause animation' }).click();
  const paused = await page.locator('#lab-clock').inputValue();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  ensure(await page.locator('#lab-clock').inputValue() === paused, 'Pause did not freeze time.');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('slider', { name: 'Simulation time' }).focus(); await page.keyboard.press('ArrowRight');
  ensure(Number(await page.locator('#lab-clock').inputValue()) > 0, 'Keyboard clock scrubbing failed.');
  await page.getByRole('button', { name: 'Change velocity, keep duration fixed', exact: true }).click();
  ensure(await page.locator('#lab-duration').isDisabled(), 'Comparison must lock other settings.');
  await page.locator('#lab-u').fill('8'); await confirm().check(); await predict().fill('40');
  await page.getByRole('button', { name: 'Run experiment B' }).click();
  await page.getByText('With duration fixed, doubling speed doubled the distance.', { exact: false }).waitFor();
  ensure((await row('Total distance (m)').innerText()).includes('20\t40'), 'Comparison must retain A=20 and show B=40.');
  await page.getByRole('button', { name: 'Distance', exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/lab-desktop-comparison.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.screenshot({ path: 'output/playwright/lab-dark-comparison.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForFunction(() => document.querySelector('section[aria-label="Motion graphs"] svg').viewBox.baseVal.width < 400);
  ensure(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page overflows horizontally.');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/lab-mobile-comparison.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.getByRole('button', { name: 'Ch. 2 · pp. 38–39', exact: true }).click();
  await page.getByRole('dialog').getByText('4 / 26', { exact: true }).waitFor();
  await page.waitForFunction(() => { const canvas = document.querySelector('[role="dialog"] canvas'); return canvas && canvas.width > 0 && canvas.height > 0; });
  await page.screenshot({ path: 'output/playwright/lab-source-mobile.png' });
  await page.keyboard.press('Escape'); ensure(!await page.getByRole('dialog').count(), 'Escape did not close source reader.');
  await page.getByRole('button', { name: /02 · Constant acceleration/ }).click();
  await page.locator('#lab-u').fill('6'); await page.locator('#lab-a').fill('-2'); await page.locator('#lab-duration').fill('6');
  await confirm().check(); await predict().fill('-6'); await page.getByRole('button', { name: 'Test my prediction', exact: true }).click();
  await page.getByText('Velocity reaches zero at 3 s, then reverses.', { exact: false }).waitFor();
  ensure((await row('Total distance (m)').innerText()).includes('18'), 'Turning distance should be 18 m.');
  ensure((await row('Displacement (m)').innerText()).includes('0'), 'Turning displacement should be zero.');
  await page.getByRole('button', { name: 'Acceleration', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/lab-acceleration-mobile.png', fullPage: true });
  await page.getByRole('button', { name: /03 · Distance & displacement/ }).click();
  await confirm().check(); await predict().fill('0'); await page.getByRole('button', { name: 'Test my prediction', exact: true }).click();
  await page.getByText('The two legs add 40 m to the total path', { exact: false }).waitFor();
  ensure((await row('Total distance (m)').innerText()).includes('40'), 'Two-leg distance should be 40 m.');
  ensure(await page.getByRole('button', { name: 'Acceleration', exact: true }).count() === 0, 'Journey must not claim to simulate its acceleration.');
  await page.getByRole('region', { name: 'Session summary' }).getByRole('button').filter({ hasText: '1. Steady on the straight' }).click();
  ensure(await page.getByRole('textbox', { name: 'Start with a question' }).inputValue() === 'How far at constant velocity?', 'Notebook reopened the wrong question.');
  ensure(await page.locator('#lab-reasoning').inputValue() === 'I expect distance to grow steadily.', 'Notebook reopened the wrong reasoning.');
  ensure(await predict().inputValue() === '20', 'Notebook did not restore the recorded prediction.');
  ensure(!await confirm().isChecked(), 'Reopened runs must require confirmation before another commit.');
  await page.getByRole('button', { name: /03 · Distance & displacement/ }).click();
  const before = aiFixtures;
  await page.getByRole('textbox', { name: 'Start with a question' }).fill('Simulate a projectile with friction');
  await page.getByRole('button', { name: 'Find an experiment', exact: true }).click();
  await page.getByText('This lab models straight-line uniform motion', { exact: false }).first().waitFor();
  ensure(aiFixtures === before, 'Unsupported question unexpectedly requested AI feedback.');
  staleProposal = true;
  await page.getByRole('textbox', { name: 'Start with a question' }).fill('Test constant motion');
  await page.getByRole('button', { name: 'Find an experiment', exact: true }).click();
  await page.getByRole('textbox', { name: 'Start with a question' }).fill('I changed my question');
  await page.waitForTimeout(800);
  ensure(await page.getByRole('button', { name: /03 · Distance & displacement/ }).getAttribute('aria-pressed') === 'true', 'Stale proposal changed the selected experiment.');
  await page.getByRole('button', { name: /01 · Uniform motion/ }).click();
  await page.getByRole('checkbox', { name: 'Exploration mode · run without a prediction' }).check();
  await confirm().check(); failNextRun = true;
  await page.getByRole('button', { name: 'Run exploration' }).click();
  await page.getByRole('button', { name: 'Retry run', exact: true }).waitFor(); await page.getByRole('button', { name: 'Retry run', exact: true }).click();
  await page.getByText('This was an exploration run. No prediction was recorded.', { exact: true }).waitFor();
  ensure(aiFixtures === before + 1, 'Slider/draft actions must not create provider requests.');
  await page.context().setOffline(true); await page.getByRole('button', { name: 'Restart lab', exact: true }).click();
  await page.getByRole('button', { name: 'Retry connection', exact: true }).waitFor();
  await page.context().setOffline(false); await page.getByRole('button', { name: 'Retry connection', exact: true }).click();
  await page.getByRole('button', { name: /01 · Uniform motion/ }).waitFor();
  ensure(await page.locator('#lab-u').inputValue() === '4' && await predict().inputValue() === '' && !await confirm().isChecked(), 'Restart did not reset settings, prediction and confirmation.');
  ensure(errors.length === 0, 'Unexpected browser errors: ' + errors.join('; '));
  console.log('PASS: actual local UI/auth/engine, prediction, units, pause/reset/keyboard, controlled comparison, all families, responsive dark/light, PDF page mapping, stale response, offline retry and exploration. AI UI responses were labelled fixtures; no live provider was contacted by this script.');
}
