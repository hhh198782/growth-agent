import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createStore } from '../src/store/sqlite-store.js';

function withStore() {
  const dir = mkdtempSync(join(tmpdir(), 'growth-agent-store-'));
  const store = createStore({ dbPath: join(dir, 'test.sqlite') });
  return {
    store,
    cleanup() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('store initializes schema and seeds default operating data', () => {
  const { store, cleanup } = withStore();
  try {
    const state = store.getState();
    assert.equal(state.campaigns.length, 1);
    assert.equal(state.targets.length >= 2, true);
    assert.equal(state.metrics.totalTargets, state.targets.length);
    assert.equal(state.metrics.queuedDrafts, 0);
  } finally {
    cleanup();
  }
});

test('store creates campaign, target, draft, and updates draft status', () => {
  const { store, cleanup } = withStore();
  try {
    const campaign = store.createCampaign({
      name: '二维码推广',
      toolId: 'qrcode',
      toolName: '二维码生成',
      miniappPath: '/pages/qrcode/qrcode',
      goal: '快速生成可保存的二维码',
      dailyLimit: 3
    });
    const target = store.createTarget({
      label: '自媒体交流群',
      kind: 'group',
      allowed: true,
      riskLevel: 'low',
      note: '只发工具分享'
    });
    const draft = store.createDraft({
      campaignId: campaign.id,
      targetId: target.id,
      channel: 'wechat_group',
      sourceCode: 'wechat_group_qrcode_target_20260629_abc123',
      sourcePath: '/pages/qrcode/qrcode?source=wechat_group_qrcode_target_20260629_abc123',
      body: '测试草稿'
    });
    const updated = store.updateDraftStatus(draft.id, 'sent');
    const state = store.getState();

    assert.equal(campaign.toolId, 'qrcode');
    assert.equal(target.allowed, true);
    assert.equal(updated.status, 'sent');
    assert.equal(state.drafts.some((item) => item.id === draft.id && item.status === 'sent'), true);
    assert.equal(state.metrics.sentDrafts, 1);
  } finally {
    cleanup();
  }
});

test('store creates multiple targets and deletes a target with its drafts', () => {
  const { store, cleanup } = withStore();
  try {
    const created = store.createTargets({
      labels: ['Group A', 'Group B', 'Group A', ''],
      kind: 'group',
      allowed: true,
      riskLevel: 'low',
      note: 'batch'
    });
    const campaign = store.createCampaign({
      name: 'Batch campaign',
      toolId: 'compress',
      toolName: 'Compress',
      miniappPath: '/pages/compress/compress',
      goal: 'test',
      dailyLimit: 10
    });
    const draft = store.createDraft({
      campaignId: campaign.id,
      targetId: created[0].id,
      channel: 'wechat_group',
      sourceCode: 'source_a',
      sourcePath: '/pages/compress/compress?source=source_a',
      body: 'draft'
    });
    const deleted = store.deleteTarget(created[0].id);
    const state = store.getState();

    assert.equal(created.length, 2);
    assert.equal(deleted.id, created[0].id);
    assert.equal(state.targets.some((target) => target.id === created[0].id), false);
    assert.equal(state.drafts.some((item) => item.id === draft.id), false);
  } finally {
    cleanup();
  }
});
