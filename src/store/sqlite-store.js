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

function rowMiniapp(row) {
  return {
    id: row.id,
    appId: row.app_id || '',
    appName: row.app_name,
    toolId: row.tool_id,
    toolName: row.tool_name,
    miniappPath: row.miniapp_path,
    goal: row.goal,
    dailyLimit: row.daily_limit,
    source: row.source,
    syncStatus: row.sync_status || 'manual',
    syncMessage: row.sync_message || '',
    lastSyncAt: row.last_sync_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
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

    CREATE TABLE IF NOT EXISTS miniapps (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL DEFAULT '',
      app_name TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      miniapp_path TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '',
      daily_limit INTEGER NOT NULL DEFAULT 20,
      source TEXT NOT NULL DEFAULT 'manual',
      sync_status TEXT NOT NULL DEFAULT 'manual',
      sync_message TEXT NOT NULL DEFAULT '',
      last_sync_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wechat_credentials (
      app_id TEXT PRIMARY KEY,
      miniapp_id TEXT NOT NULL,
      app_secret TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

  function addColumnIfMissing(table, column, definition) {
    const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    if (!columns.has(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    }
  }

  addColumnIfMissing('miniapps', 'app_id', "app_id TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('miniapps', 'sync_status', "sync_status TEXT NOT NULL DEFAULT 'manual'");
  addColumnIfMissing('miniapps', 'sync_message', "sync_message TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('miniapps', 'last_sync_at', "last_sync_at TEXT NOT NULL DEFAULT ''");
  db.exec('CREATE INDEX IF NOT EXISTS idx_miniapps_app_id ON miniapps(app_id)');

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

  function createMiniapp(input) {
    const createdAt = input.createdAt || nowIso();
    const miniapp = {
      id: input.id || `miniapp_${randomUUID()}`,
      appId: String(input.appId || '').trim(),
      appName: String(input.appName || '').trim(),
      toolId: String(input.toolId || '').trim(),
      toolName: String(input.toolName || '').trim(),
      miniappPath: String(input.miniappPath || '').trim(),
      goal: String(input.goal || '').trim(),
      dailyLimit: Math.max(1, Math.min(200, Number(input.dailyLimit || 20))),
      source: String(input.source || 'manual').trim() || 'manual',
      syncStatus: String(input.syncStatus || 'manual').trim() || 'manual',
      syncMessage: String(input.syncMessage || '').trim(),
      lastSyncAt: input.lastSyncAt || '',
      createdAt,
      updatedAt: input.updatedAt || createdAt
    };
    if (!miniapp.appName || !miniapp.toolId || !miniapp.toolName || !miniapp.miniappPath) {
      throw new Error('INVALID_MINIAPP');
    }
    db.prepare(`
      INSERT INTO miniapps (
        id, app_id, app_name, tool_id, tool_name, miniapp_path, goal, daily_limit,
        source, sync_status, sync_message, last_sync_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      miniapp.id,
      miniapp.appId,
      miniapp.appName,
      miniapp.toolId,
      miniapp.toolName,
      miniapp.miniappPath,
      miniapp.goal,
      miniapp.dailyLimit,
      miniapp.source,
      miniapp.syncStatus,
      miniapp.syncMessage,
      miniapp.lastSyncAt,
      miniapp.createdAt,
      miniapp.updatedAt
    );
    return miniapp;
  }

  function listMiniapps() {
    return db.prepare('SELECT * FROM miniapps ORDER BY created_at DESC').all().map(rowMiniapp);
  }

  function getMiniapp(id) {
    const row = db.prepare('SELECT * FROM miniapps WHERE id = ?').get(id);
    return row ? rowMiniapp(row) : null;
  }

  function getMiniappByAppId(appId) {
    const row = db.prepare('SELECT * FROM miniapps WHERE app_id = ?').get(appId);
    return row ? rowMiniapp(row) : null;
  }

  function getWechatCredential(appId) {
    const row = db.prepare('SELECT * FROM wechat_credentials WHERE app_id = ?').get(String(appId || '').trim());
    if (!row) return null;
    return {
      appId: row.app_id,
      miniappId: row.miniapp_id,
      appSecret: row.app_secret,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function saveWechatCredential({ appId, miniappId, appSecret }) {
    const existing = getWechatCredential(appId);
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO wechat_credentials (app_id, miniapp_id, app_secret, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(app_id) DO UPDATE SET
        miniapp_id = excluded.miniapp_id,
        app_secret = excluded.app_secret,
        updated_at = excluded.updated_at
    `).run(
      appId,
      miniappId,
      appSecret,
      existing?.createdAt || timestamp,
      timestamp
    );
  }

  function upsertWechatMiniapp(input) {
    const appId = String(input.appId || '').trim();
    const appSecret = String(input.appSecret || '').trim();
    if (!appId || !appSecret) {
      throw new Error('INVALID_WECHAT_CREDENTIALS');
    }

    const existing = getMiniappByAppId(appId);
    const timestamp = nowIso();
    const miniapp = {
      id: existing?.id || input.id || `miniapp_${randomUUID()}`,
      appId,
      appName: String(input.appName || existing?.appName || '').trim(),
      toolId: String(input.toolId || existing?.toolId || '').trim(),
      toolName: String(input.toolName || existing?.toolName || '').trim(),
      miniappPath: String(input.miniappPath || existing?.miniappPath || '').trim(),
      goal: String(input.goal || existing?.goal || '').trim(),
      dailyLimit: Math.max(1, Math.min(200, Number(input.dailyLimit || existing?.dailyLimit || 20))),
      source: 'wechat_official',
      syncStatus: String(input.syncStatus || 'connected').trim() || 'connected',
      syncMessage: String(input.syncMessage || '').trim(),
      lastSyncAt: input.lastSyncAt || timestamp,
      createdAt: existing?.createdAt || input.createdAt || timestamp,
      updatedAt: timestamp
    };
    if (!miniapp.appName || !miniapp.toolId || !miniapp.toolName || !miniapp.miniappPath) {
      throw new Error('INVALID_MINIAPP');
    }

    if (existing) {
      db.prepare(`
        UPDATE miniapps
        SET
          app_id = ?,
          app_name = ?,
          tool_id = ?,
          tool_name = ?,
          miniapp_path = ?,
          goal = ?,
          daily_limit = ?,
          source = ?,
          sync_status = ?,
          sync_message = ?,
          last_sync_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        miniapp.appId,
        miniapp.appName,
        miniapp.toolId,
        miniapp.toolName,
        miniapp.miniappPath,
        miniapp.goal,
        miniapp.dailyLimit,
        miniapp.source,
        miniapp.syncStatus,
        miniapp.syncMessage,
        miniapp.lastSyncAt,
        miniapp.updatedAt,
        miniapp.id
      );
    } else {
      db.prepare(`
        INSERT INTO miniapps (
          id, app_id, app_name, tool_id, tool_name, miniapp_path, goal, daily_limit,
          source, sync_status, sync_message, last_sync_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        miniapp.id,
        miniapp.appId,
        miniapp.appName,
        miniapp.toolId,
        miniapp.toolName,
        miniapp.miniappPath,
        miniapp.goal,
        miniapp.dailyLimit,
        miniapp.source,
        miniapp.syncStatus,
        miniapp.syncMessage,
        miniapp.lastSyncAt,
        miniapp.createdAt,
        miniapp.updatedAt
      );
    }

    saveWechatCredential({ appId, miniappId: miniapp.id, appSecret });
    return getMiniapp(miniapp.id);
  }

  function createCampaignFromMiniapp(id, input = {}) {
    const miniapp = getMiniapp(id);
    if (!miniapp) {
      throw new Error('MINIAPP_NOT_FOUND');
    }
    return createCampaign({
      name: String(input.name || '').trim() || `${miniapp.appName} launch`,
      toolId: miniapp.toolId,
      toolName: miniapp.toolName,
      miniappPath: miniapp.miniappPath,
      goal: input.goal === undefined ? miniapp.goal : input.goal,
      dailyLimit: input.dailyLimit === undefined ? miniapp.dailyLimit : input.dailyLimit
    });
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
    const miniapps = listMiniapps();
    const campaigns = listCampaigns();
    const targets = listTargets();
    const drafts = listDrafts();
    return {
      miniapps,
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
    const miniappCount = db.prepare('SELECT COUNT(*) AS count FROM miniapps').get().count;
    if (miniappCount === 0) {
      createMiniapp({
        id: 'miniapp_default_compress',
        appName: '图片压缩工具',
        toolId: 'compress',
        toolName: '图片压缩',
        miniappPath: '/pages/compress/compress',
        goal: '帮助用户在微信里快速压缩图片，减少上传失败',
        dailyLimit: 20,
        source: 'preset'
      });
    }

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
    createMiniapp,
    upsertWechatMiniapp,
    getWechatCredential,
    listMiniapps,
    getMiniapp,
    createCampaignFromMiniapp,
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
