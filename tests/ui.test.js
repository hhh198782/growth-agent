import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('UI no longer exposes the manual campaign creation form', () => {
  const html = readFileSync('public/index.html', 'utf8');
  const script = readFileSync('public/app.js', 'utf8');

  assert.equal(html.includes('id="campaignForm"'), false);
  assert.equal(html.includes('新建活动'), false);
  assert.equal(html.includes('data-action="apply-selected-miniapp"'), false);
  assert.equal(script.includes("$('#campaignForm')"), false);
});
