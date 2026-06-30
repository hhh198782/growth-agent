import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMiniappPath, makeSourceCode, slugify } from '../src/domain/source-code.js';
import { generateDraft } from '../src/domain/content-generator.js';
import { canCreateDraft } from '../src/domain/frequency-policy.js';

test('slugify keeps safe ascii and falls back for Chinese labels', () => {
  assert.equal(slugify('WeChat Group A'), 'wechat-group-a');
  assert.equal(slugify('测试群：文件处理'), 'target');
});

test('makeSourceCode creates stable source code with date and short hash', () => {
  const source = makeSourceCode({
    channel: 'wechat_group',
    toolId: 'compress',
    targetLabel: '测试群：文件处理',
    now: new Date('2026-06-29T00:00:00Z')
  });

  assert.match(source, /^wechat_group_compress_target_20260629_[a-z0-9]{6}$/);
});

test('buildMiniappPath appends source query without losing existing query', () => {
  const path = buildMiniappPath('/pages/compress/compress?mode=fast', {
    source: 'wechat_group_compress_target_20260629_abc123',
    campaign: 'launch'
  });

  assert.equal(
    path,
    '/pages/compress/compress?mode=fast&source=wechat_group_compress_target_20260629_abc123&campaign=launch'
  );
});

test('generateDraft produces a reviewable WeChat draft with source-coded path', () => {
  const draft = generateDraft({
    campaign: {
      id: 'campaign-1',
      name: '图片压缩冷启动',
      toolId: 'compress',
      toolName: '图片压缩',
      miniappPath: '/pages/compress/compress',
      goal: '帮助用户在微信里快速压缩图片'
    },
    target: {
      id: 'target-1',
      label: '素材交流群',
      kind: 'group'
    },
    sourceCode: 'wechat_group_compress_target_20260629_abc123'
  });

  assert.equal(draft.channel, 'wechat_group');
  assert.match(draft.body, /图片压缩/);
  assert.match(draft.body, /\/pages\/compress\/compress\?source=wechat_group_compress_target_20260629_abc123/);
  assert.match(draft.body, /手动确认后再发送/);
});

test('canCreateDraft blocks disallowed targets, duplicates, and daily limit overflow', () => {
  const target = { id: 'target-1', allowed: true };
  const now = new Date('2026-06-29T10:00:00Z');
  const existingDrafts = [
    { targetId: 'target-2', campaignId: 'campaign-1', status: 'sent', createdAt: '2026-06-29T08:00:00Z' },
    { targetId: 'target-3', campaignId: 'campaign-1', status: 'queued', createdAt: '2026-06-28T08:00:00Z' }
  ];

  assert.deepEqual(
    canCreateDraft({ target, campaignId: 'campaign-1', existingDrafts, dailyLimit: 2, now }),
    { allowed: true, reason: 'allowed' }
  );

  assert.equal(
    canCreateDraft({
      target: { id: 'target-9', allowed: false },
      campaignId: 'campaign-1',
      existingDrafts,
      dailyLimit: 2,
      now
    }).allowed,
    false
  );

  assert.equal(
    canCreateDraft({
      target,
      campaignId: 'campaign-1',
      existingDrafts: existingDrafts.concat({
        targetId: 'target-1',
        campaignId: 'campaign-1',
        status: 'queued',
        createdAt: '2026-06-29T09:00:00Z'
      }),
      dailyLimit: 5,
      now
    }).reason,
    'duplicate_target_today'
  );

  assert.equal(
    canCreateDraft({
      target,
      campaignId: 'campaign-1',
      existingDrafts: existingDrafts.concat({
        targetId: 'target-4',
        campaignId: 'campaign-1',
        status: 'queued',
        createdAt: '2026-06-29T09:00:00Z'
      }),
      dailyLimit: 2,
      now
    }).reason,
    'daily_limit_reached'
  );
});

