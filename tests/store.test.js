import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

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
    assert.equal(state.miniapps.length >= 1, true);
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

test('store saves miniapp profiles and creates campaigns from them', () => {
  const { store, cleanup } = withStore();
  try {
    const miniapp = store.createMiniapp({
      appName: 'Toolkit Box',
      toolId: 'compress',
      toolName: 'Image Compress',
      miniappPath: '/pages/compress/compress',
      goal: 'Compress images inside WeChat',
      dailyLimit: 12
    });
    const campaign = store.createCampaignFromMiniapp(miniapp.id, {
      name: 'Toolkit Box launch'
    });
    const state = store.getState();

    assert.equal(miniapp.appName, 'Toolkit Box');
    assert.equal(campaign.name, 'Toolkit Box launch');
    assert.equal(campaign.toolId, 'compress');
    assert.equal(campaign.toolName, 'Image Compress');
    assert.equal(campaign.miniappPath, '/pages/compress/compress');
    assert.equal(campaign.goal, 'Compress images inside WeChat');
    assert.equal(campaign.dailyLimit, 12);
    assert.equal(state.miniapps.some((item) => item.id === miniapp.id), true);
  } finally {
    cleanup();
  }
});

test('store upserts WeChat miniapp credentials without exposing app secrets', () => {
  const { store, cleanup } = withStore();
  try {
    const miniapp = store.upsertWechatMiniapp({
      appId: 'wx1234567890abcdef',
      appSecret: 'secret-value',
      appName: 'Official Tool',
      toolId: 'official_tool',
      toolName: 'Official Tool',
      miniappPath: '/pages/index/index',
      goal: 'Official goal',
      dailyLimit: 18,
      syncStatus: 'connected',
      syncMessage: 'Imported from WeChat official API'
    });
    const state = store.getState();
    const saved = state.miniapps.find((item) => item.id === miniapp.id);

    assert.equal(miniapp.appId, 'wx1234567890abcdef');
    assert.equal(miniapp.source, 'wechat_official');
    assert.equal(miniapp.syncStatus, 'connected');
    assert.equal(miniapp.appSecret, undefined);
    assert.equal(saved.appSecret, undefined);
    assert.equal(saved.appId, 'wx1234567890abcdef');
    assert.equal(store.getWechatCredential('wx1234567890abcdef').appSecret, 'secret-value');

    const updated = store.upsertWechatMiniapp({
      appId: 'wx1234567890abcdef',
      appSecret: 'secret-value-2',
      appName: 'Official Tool Updated',
      toolId: 'official_tool',
      toolName: 'Official Tool Updated',
      miniappPath: '/pages/home/home',
      goal: 'Updated goal',
      syncStatus: 'connected',
      syncMessage: 'Rechecked'
    });

    assert.equal(updated.id, miniapp.id);
    assert.equal(updated.appName, 'Official Tool Updated');
    assert.equal(updated.miniappPath, '/pages/home/home');
    assert.equal(store.getWechatCredential('wx1234567890abcdef').appSecret, 'secret-value-2');
  } finally {
    cleanup();
  }
});

test('store migrates an existing miniapps table before indexing AppID', () => {
  const dir = mkdtempSync(join(tmpdir(), 'growth-agent-store-migration-'));
  const dbPath = join(dir, 'test.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE miniapps (
      id TEXT PRIMARY KEY,
      app_name TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      miniapp_path TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '',
      daily_limit INTEGER NOT NULL DEFAULT 20,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.close();

  const store = createStore({ dbPath });
  try {
    const miniapp = store.upsertWechatMiniapp({
      appId: 'wxabcdef1234567890',
      appSecret: 'secret-value',
      appName: 'Migrated Tool',
      toolId: 'migrated_tool',
      toolName: 'Migrated Tool',
      miniappPath: '/pages/index/index',
      goal: 'Migrated goal'
    });

    assert.equal(miniapp.appId, 'wxabcdef1234567890');
    assert.equal(store.getWechatCredential('wxabcdef1234567890').appSecret, 'secret-value');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store tracks personal WeChat scan login and syncs group targets', () => {
  const { store, cleanup } = withStore();
  try {
    const login = store.startWechatPersonalLogin({ mode: 'wcf_http' });
    assert.equal(login.status, 'waiting_scan');
    assert.equal(login.mode, 'wcf_http');
    assert.equal(login.qrPayload, '');

    const connected = store.confirmWechatPersonalLogin({ displayName: '个人微信小号' });
    assert.equal(connected.status, 'connected');
    assert.equal(connected.displayName, '个人微信小号');

    const synced = store.syncWechatTargets({
      labels: ['A装修交流群', 'A材料交流群', 'A装修交流群'],
      kind: 'group',
      note: '微信扫码同步'
    });
    const state = store.getState();

    assert.equal(synced.created.length, 2);
    assert.equal(state.wechatPersonal.status, 'connected');
    assert.equal(state.wechatPersonal.lastSyncCount, 2);
    assert.equal(state.targets.some((target) => target.label === 'A材料交流群'), true);
  } finally {
    cleanup();
  }
});
