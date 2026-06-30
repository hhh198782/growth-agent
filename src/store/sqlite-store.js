import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function nowIso() {
  return new Date().toISOString();
}

function rowCampaign(row) {
  return {
    id: row.id,
    name: row.name,
    toolId: row.tool_id,
    toolName: row.tool_name,
    miniappPath: row.miniapp_path,
    goal: row.goal,
    dailyLimit: row.daily_limit,
    createdAt: row.created_at
  };
}

function rowTarget(row) {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    allowed: Boolean(row.allowed),
    riskLevel: row.risk_level,
    note: row.note,
    createdAt: row.created_at
  };
}

function rowDraft(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    targetId: row.target_id,
    channel: row.channel,
    sourceCode: row.source_code,
    sourcePath: row.source_path,
    body: row.body,
    status: row.status,
    campaignName: row.campaign_name || '',
    targetLabel: row.target_label || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTargetLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function createStore({ dbPath = 'data/growth-agent.sqlite' } = {}) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      miniapp_path TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '',
      daily_limit INTEGER NOT NULL DEFAULT 20,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('group', 'friend', 'moments')),
      allowed INTEGER NOT NULL DEFAULT 1,
      risk_level TEXT NOT NULL DEFAULT 'low',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      target_id TEXT NOT NULL REFERENCES targets(id),
      channel TEXT NOT NULL,
      source_code TEXT NOT NULL,
      source_path TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'copied', 'sent', 'skipped')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  function createCampaign(input) {
    const campaign = {
      id: input.id || `campaign_${randomUUID()}`,
      name: String(input.name || '').trim(),
      toolId: String(input.toolId || '').trim(),
      toolName: String(input.toolName || '').trim(),
      miniappPath: String(input.miniappPath || '').trim(),
      goal: String(input.goal || '').trim(),
      dailyLimit: Math.max(1, Math.min(200, Number(input.dailyLimit || 20))),
      createdAt: input.createdAt || nowIso()
    };
    if (!campaign.name || !campaign.toolId || !campaign.toolName || !campaign.miniappPath) {
      throw new Error('INVALID_CAMPAIGN');
    }
    db.prepare(`
      INSERT INTO campaigns (id, name, tool_id, tool_name, miniapp_path, goal, daily_limit, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      campaign.id,
      campaign.name,
      campaign.toolId,
      campaign.toolName,
      campaign.miniappPath,
      campaign.goal,
      campaign.dailyLimit,
      campaign.createdAt
    );
    return campaign;
  }

  function createTarget(input) {
    const label = normalizeTargetLabel(input.label);
    if (label.length > 120) {
      throw new Error('TARGET_LABEL_TOO_LONG');
    }
    const target = {
      id: input.id || `target_${randomUUID()}`,
      label,
      kind: ['group', 'friend', 'moments'].includes(input.kind) ? input.kind : 'group',
      allowed: input.allowed !== false,
      riskLevel: String(input.riskLevel || 'low').trim(),
      note: String(input.note || '').trim(),
      createdAt: input.createdAt || nowIso()
    };
    if (!target.label) {
      throw new Error('INVALID_TARGET');
    }
    db.prepare(`
      INSERT INTO targets (id, label, kind, allowed, risk_level, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      target.id,
      target.label,
      target.kind,
      target.allowed ? 1 : 0,
      target.riskLevel,
      target.note,
      target.createdAt
    );
    return target;
  }

  function createTargets(input) {
    const seen = new Set();
    const labels = Array.isArray(input.labels) ? input.labels : [];
    const created = [];

    for (const value of labels) {
      const label = normalizeTargetLabel(value);
      const key = label.toLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      created.push(createTarget({ ...input, label }));
    }

    return created;
  }

  function createDraft(input) {
    const draft = {
      id: input.id || `draft_${randomUUID()}`,
      campaignId: input.campaignId,
      targetId: input.targetId,
      channel: input.channel,
      sourceCode: input.sourceCode,
      sourcePath: input.sourcePath,
      body: input.body,
      status: input.status || 'queued',
      createdAt: input.createdAt || nowIso(),
      updatedAt: input.updatedAt || nowIso()
    };
    db.prepare(`
      INSERT INTO drafts (id, campaign_id, target_id, channel, source_code, source_path, body, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.id,
      draft.campaignId,
      draft.targetId,
      draft.channel,
      draft.sourceCode,
      draft.sourcePath,
      draft.body,
      draft.status,
      draft.createdAt,
      draft.updatedAt
    );
    return draft;
  }

  function listCampaigns() {
    return db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all().map(rowCampaign);
  }

  function listTargets() {
    return db.prepare('SELECT * FROM targets ORDER BY created_at DESC').all().map(rowTarget);
  }

  function listDrafts() {
    return db.prepare(`
      SELECT
        drafts.*,
        campaigns.name AS campaign_name,
        targets.label AS target_label
      FROM drafts
      JOIN campaigns ON campaigns.id = drafts.campaign_id
      JOIN targets ON targets.id = drafts.target_id
      ORDER BY drafts.created_at DESC
    `).all().map(rowDraft);
  }

  function getCampaign(id) {
    const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    return row ? rowCampaign(row) : null;
  }

  function getTarget(id) {
    const row = db.prepare('SELECT * FROM targets WHERE id = ?').get(id);
    return row ? rowTarget(row) : null;
  }

  function deleteTarget(id) {
    const target = getTarget(id);
    if (!target) return null;
    db.prepare('DELETE FROM drafts WHERE target_id = ?').run(id);
    db.prepare('DELETE FROM targets WHERE id = ?').run(id);
    return target;
  }

  function getDraft(id) {
    const row = db.prepare(`
      SELECT
        drafts.*,
        campaigns.name AS campaign_name,
        targets.label AS target_label
      FROM drafts
      JOIN campaigns ON campaigns.id = drafts.campaign_id
      JOIN targets ON targets.id = drafts.target_id
      WHERE drafts.id = ?
    `).get(id);
    return row ? rowDraft(row) : null;
  }

  function updateDraftStatus(id, status) {
    if (!['queued', 'copied', 'sent', 'skipped'].includes(status)) {
      throw new Error('INVALID_DRAFT_STATUS');
    }
    db.prepare('UPDATE drafts SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
    const draft = getDraft(id);
    if (!draft) throw new Error('DRAFT_NOT_FOUND');
    return draft;
  }

  function getState() {
    const campaigns = listCampaigns();
    const targets = listTargets();
    const drafts = listDrafts();
    return {
      campaigns,
      targets,
      drafts,
      metrics: {
        totalTargets: targets.length,
        queuedDrafts: drafts.filter((draft) => draft.status === 'queued').length,
        copiedDrafts: drafts.filter((draft) => draft.status === 'copied').length,
        sentDrafts: drafts.filter((draft) => draft.status === 'sent').length,
        skippedDrafts: drafts.filter((draft) => draft.status === 'skipped').length
      }
    };
  }

  function seedDefaults() {
    const campaignCount = db.prepare('SELECT COUNT(*) AS count FROM campaigns').get().count;
    if (campaignCount === 0) {
      createCampaign({
        id: 'campaign_default_compress',
        name: '图片压缩冷启动',
        toolId: 'compress',
        toolName: '图片压缩',
        miniappPath: '/pages/compress/compress',
        goal: '帮助用户在微信里快速压缩图片，减少上传失败',
        dailyLimit: 20
      });
    }

    const targetCount = db.prepare('SELECT COUNT(*) AS count FROM targets').get().count;
    if (targetCount === 0) {
      createTarget({
        id: 'target_moments',
        label: '朋友圈',
        kind: 'moments',
        allowed: true,
        riskLevel: 'low',
        note: '个人动态，人工发布'
      });
      createTarget({
        id: 'target_test_group',
        label: '测试群：工具分享',
        kind: 'group',
        allowed: true,
        riskLevel: 'low',
        note: '先验证话术，不连续刷屏'
      });
    }
  }

  seedDefaults();

  return {
    close: () => db.close(),
    createCampaign,
    createTarget,
    createTargets,
    deleteTarget,
    createDraft,
    listCampaigns,
    listTargets,
    listDrafts,
    getCampaign,
    getTarget,
    getState,
    updateDraftStatus
  };
}
