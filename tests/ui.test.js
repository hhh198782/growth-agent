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

test('UI exposes personal WeChat scan login and group sync workflow', () => {
  const html = readFileSync('public/index.html', 'utf8');
  const script = readFileSync('public/app.js', 'utf8');

  assert.equal(html.includes('个人微信连接'), true);
  assert.equal(html.includes('WeChatFerry'), true);
  assert.equal(html.includes('扫码登录'), true);
  assert.equal(html.includes('同步微信群'), true);
  assert.equal(html.includes('不自动群发'), true);
  assert.equal(script.includes('/api/wechat-personal/login/start'), true);
  assert.equal(script.includes('/api/wechat-personal/sync-targets'), true);
});
