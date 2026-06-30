import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createApp } from '../server/app.js';
import { createStore } from '../src/store/sqlite-store.js';

async function withServer(testFn) {
  const dir = mkdtempSync(join(tmpdir(), 'growth-agent-api-'));
  const store = createStore({ dbPath: join(dir, 'test.sqlite') });
  const server = createServer(createApp({ store, staticDir: null }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await testFn({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const body = await response.json();
  return { response, body };
}

test('GET /api/state returns campaigns, targets, drafts, and metrics', async () => {
  await withServer(async ({ baseUrl }) => {
    const { response, body } = await jsonFetch(`${baseUrl}/api/state`);

    assert.equal(response.status, 200);
    assert.equal(body.campaigns.length, 1);
    assert.equal(body.targets.length >= 2, true);
    assert.equal(body.metrics.queuedDrafts, 0);
  });
});

test('API creates campaign and target, generates source-coded draft, and updates status', async () => {
  await withServer(async ({ baseUrl }) => {
    const campaignResult = await jsonFetch(`${baseUrl}/api/campaigns`, {
      method: 'POST',
      body: {
        name: '二维码冷启动',
        toolId: 'qrcode',
        toolName: '二维码生成',
        miniappPath: '/pages/qrcode/qrcode',
        goal: '给自媒体用户快速生成二维码',
        dailyLimit: 3
      }
    });
    const targetResult = await jsonFetch(`${baseUrl}/api/targets`, {
      method: 'POST',
      body: {
        label: '自媒体交流群',
        kind: 'group',
        allowed: true,
        riskLevel: 'low',
        note: '白名单'
      }
    });
    const generateResult = await jsonFetch(`${baseUrl}/api/drafts/generate`, {
      method: 'POST',
      body: {
        campaignId: campaignResult.body.id,
        targetIds: [targetResult.body.id]
      }
    });
    const draft = generateResult.body.created[0];
    const statusResult = await jsonFetch(`${baseUrl}/api/drafts/${draft.id}/status`, {
      method: 'PATCH',
      body: { status: 'copied' }
    });

    assert.equal(campaignResult.response.status, 201);
    assert.equal(targetResult.response.status, 201);
    assert.equal(generateResult.response.status, 201);
    assert.equal(generateResult.body.blocked.length, 0);
    assert.match(draft.sourceCode, /^wechat_group_qrcode/);
    assert.match(draft.body, /二维码生成/);
    assert.equal(statusResult.response.status, 200);
    assert.equal(statusResult.body.status, 'copied');
  });
});

test('API bulk-creates targets and deletes an incorrect target', async () => {
  await withServer(async ({ baseUrl }) => {
    const bulkResult = await jsonFetch(`${baseUrl}/api/targets/bulk`, {
      method: 'POST',
      body: {
        labels: ['Group One', 'Group Two', 'Group One', ''],
        kind: 'group',
        allowed: true,
        riskLevel: 'low',
        note: 'batch add'
      }
    });
    const deleteResult = await jsonFetch(`${baseUrl}/api/targets/${bulkResult.body.created[0].id}`, {
      method: 'DELETE'
    });
    const stateResult = await jsonFetch(`${baseUrl}/api/state`);

    assert.equal(bulkResult.response.status, 201);
    assert.equal(bulkResult.body.created.length, 2);
    assert.equal(deleteResult.response.status, 200);
    assert.equal(deleteResult.body.id, bulkResult.body.created[0].id);
    assert.equal(
      stateResult.body.targets.some((target) => target.id === bulkResult.body.created[0].id),
      false
    );
  });
});

test('API splits pasted A-prefixed target list into separate targets', async () => {
  await withServer(async ({ baseUrl }) => {
    const bulkResult = await jsonFetch(`${baseUrl}/api/targets/bulk`, {
      method: 'POST',
      body: {
        labels: 'A测试批量群1 A测试批量群2',
        kind: 'group',
        allowed: true,
        riskLevel: 'low',
        note: 'batch add'
      }
    });

    assert.equal(bulkResult.response.status, 201);
    assert.deepEqual(
      bulkResult.body.created.map((target) => target.label),
      ['A测试批量群1', 'A测试批量群2']
    );
  });
});

test('API creates a miniapp profile and turns it into a campaign automatically', async () => {
  await withServer(async ({ baseUrl }) => {
    const miniappResult = await jsonFetch(`${baseUrl}/api/miniapps`, {
      method: 'POST',
      body: {
        appName: 'Toolkit Box',
        toolId: 'grid9',
        toolName: 'Nine Grid Maker',
        miniappPath: '/pages/grid9/grid9',
        goal: 'Make nine-grid images for social posting',
        dailyLimit: 15
      }
    });
    const campaignResult = await jsonFetch(`${baseUrl}/api/miniapps/${miniappResult.body.id}/campaign`, {
      method: 'POST',
      body: { name: 'Nine Grid launch' }
    });
    const stateResult = await jsonFetch(`${baseUrl}/api/state`);

    assert.equal(miniappResult.response.status, 201);
    assert.equal(campaignResult.response.status, 201);
    assert.equal(campaignResult.body.name, 'Nine Grid launch');
    assert.equal(campaignResult.body.toolId, 'grid9');
    assert.equal(campaignResult.body.toolName, 'Nine Grid Maker');
    assert.equal(campaignResult.body.miniappPath, '/pages/grid9/grid9');
    assert.equal(campaignResult.body.dailyLimit, 15);
    assert.equal(
      stateResult.body.miniapps.some((item) => item.id === miniappResult.body.id),
      true
    );
  });
});
