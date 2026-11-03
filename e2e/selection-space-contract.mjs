import assert from 'node:assert/strict';

export function validateSpaceTransition(result, expected) {
  const capture = result.events.filter(event => event.phase === 'capture');
  assert.deepEqual(capture.map(event => event.type), ['keydown', 'keyup', 'click'], 'one matched key pair and exactly one routed click');
  assert.ok(capture.every(event => event.same && event.connected && event.focus), 'same connected focused target throughout');
  assert.ok(capture.slice(0, 2).every(event => event.trusted && event.key === ' '), 'real keyboard input required');
  assert.equal(capture[2].trusted, false, 'Space is intentionally routed through the application click path');
  for (const type of ['keydown', 'keyup']) {
    const bubble = result.events.find(event => event.phase === 'bubble' && event.type === type);
    assert.equal(bubble?.prevented, true, `owned ${type} suppresses duplicate native activation`);
  }
  assert.equal(result.pressed, String(expected), 'selection state changed exactly as requested');
  assert.equal(result.name, expected ? '候補から解除' : '復元候補に選択');
  assert.equal(result.same, true, 'DOM identity preserved');
  assert.equal(result.focus, true, 'focus preserved');
}

export async function auditSelectionSpace(page, article) {
  const button = article.locator('button[aria-pressed]');
  await button.evaluate(button => {
    const events = []; const listeners = [];
    for (const capture of [true, false]) for (const type of ['keydown', 'keyup', 'click']) {
      const listener = event => {
        if (event.target !== button) return;
        events.push({ phase: capture ? 'capture' : 'bubble', type, key: event.key, trusted: event.isTrusted,
          prevented: event.defaultPrevented, same: event.target === button, connected: button.isConnected,
          focus: document.activeElement === button, pressed: button.getAttribute('aria-pressed'),
          active: button.matches(':active'), time: performance.now() });
      };
      document.addEventListener(type, listener, capture); listeners.push([type, listener, capture]);
    }
    window.__selectionSpaceAudit = { button, events, listeners };
  });
  const results = [];
  try {
    // Keep the original mixed-modality condition: tap twice, then Space, in this
    // same context. No sleep/retry/forced click and no refocus between Space keys.
    await button.tap(); await button.tap(); await button.focus();
    for (const expected of [true, false, true, false]) {
      await page.evaluate(() => { window.__selectionSpaceAudit.events.length = 0; });
      await page.keyboard.press('Space');
      const result = await button.evaluate(button => ({
        events: window.__selectionSpaceAudit.events, pressed: button.getAttribute('aria-pressed'),
        name: button.textContent, same: button === window.__selectionSpaceAudit.button,
        focus: document.activeElement === button,
      }));
      results.push(result); validateSpaceTransition(result, expected);
    }
    // A cancelled press must not transfer authority after focus is regained.
    await page.keyboard.down('Space'); await button.evaluate(button => button.blur());
    await button.focus(); await page.keyboard.up('Space');
    assert.equal(await button.getAttribute('aria-pressed'), 'false', 'blur cancels held Space');
    await page.keyboard.up('Space');
    assert.equal(await button.getAttribute('aria-pressed'), 'false', 'keyup alone cannot activate');
    await page.keyboard.down('Space'); await page.keyboard.down('Space'); await page.keyboard.up('Space');
    assert.equal(await button.getAttribute('aria-pressed'), 'true', 'held/repeated Space activates once');
    await page.keyboard.press('Enter');
    assert.equal(await button.getAttribute('aria-pressed'), 'false', 'native Enter still activates once');
    return { status: 'passed', transitions: results, cancellation: 'blur, unmatched release, repeat, Enter verified' };
  } finally {
    await page.evaluate(() => {
      for (const [type, listener, capture] of window.__selectionSpaceAudit.listeners) document.removeEventListener(type, listener, capture);
      delete window.__selectionSpaceAudit;
    });
  }
}
