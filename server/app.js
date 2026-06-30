import { createReadStream, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { generateDraft } from '../src/domain/content-generator.js';
import { canCreateDraft } from '../src/domain/frequency-policy.js';
import { makeSourceCode } from '../src/domain/source-code.js';
import {
  createWechatMiniappClient,
  parseWechatAuthorizationText
} from '../src/integrations/wechat-miniapp-client.js';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml']
]);

function channelFromTarget(target) {
  if (target.kind === 'friend') return 'wechat_friend';
  if (target.kind === 'moments') return 'wechat_moments';
  return 'wechat_group';
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, staticDir) {
  if (!staticDir || req.method !== 'GET') {
    sendJson(res, 404, { error: 'NOT_FOUND' });
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const root = resolve(staticDir);
  const filePath = resolve(join(root, pathname));

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    sendJson(res, 404, { error: 'NOT_FOUND' });
    return;
  }

  res.writeHead(200, {
    'content-type': MIME.get(extname(filePath)) || 'application/octet-stream'
  });
  createReadStream(filePath).pipe(res);
}

function createDraftsForCampaign({ store, campaign, targetIds }) {
  const targets = store
    .listTargets()
    .filter((target) => !Array.isArray(targetIds) || targetIds.length === 0 || targetIds.includes(target.id));
  const created = [];
  const blocked = [];

  for (const target of targets) {
    const existingDrafts = store.listDrafts().concat(created);
    const decision = canCreateDraft({
      target,
      campaignId: campaign.id,
      existingDrafts,
      dailyLimit: campaign.dailyLimit
    });

    if (!decision.allowed) {
      blocked.push({ targetId: target.id, targetLabel: target.label, reason: decision.reason });
      continue;
    }

    const channel = channelFromTarget(target);
    const sourceCode = makeSourceCode({
      channel,
      toolId: campaign.toolId,
      targetLabel: target.label
    });
    const generated = generateDraft({ campaign, target, sourceCode });
    const draft = store.createDraft({
      campaignId: campaign.id,
      targetId: target.id,
      channel: generated.channel,
      sourceCode,
      sourcePath: generated.sourcePath,
      body: generated.body
    });
    created.push({ ...draft, campaignName: campaign.name, targetLabel: target.label });
  }

  return { created, blocked };
}

function splitTargetLabels(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => splitTargetLabels(item));
  }
  return String(value || '')
    .split(/[\r\n,，;；]+/g)
    .flatMap((item) => item.split(/\s+(?=A[\u4e00-\u9fa5A-Za-z0-9])/g))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createApp({ store, staticDir, wechatClient = createWechatMiniappClient() }) {
  return async function app(req, res) {
    const url = new URL(req.url, 'http://localhost');

    try {
      if (req.method === 'GET' && url.pathname === '/api/state') {
        sendJson(res, 200, store.getState());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/campaigns') {
        const body = await readBody(req);
        sendJson(res, 201, store.createCampaign(body));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/miniapps') {
        const body = await readBody(req);
        sendJson(res, 201, store.createMiniapp(body));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/wechat-miniapps/connect') {
        const body = await readBody(req);
        const credentials = parseWechatAuthorizationText(body);
        const imported = await wechatClient.importMiniapp(credentials);
        sendJson(res, 201, store.upsertWechatMiniapp({ ...imported, appSecret: credentials.appSecret }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/wechat-personal/login/start') {
        const body = await readBody(req);
        sendJson(res, 201, store.startWechatPersonalLogin(body));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/wechat-personal/login/confirm') {
        const body = await readBody(req);
        sendJson(res, 200, store.confirmWechatPersonalLogin(body));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/wechat-personal/sync-targets') {
        const body = await readBody(req);
        const labels = splitTargetLabels(body.labels);
        sendJson(res, 201, store.syncWechatTargets({ ...body, labels }));
        return;
      }

      const miniappCampaignMatch = url.pathname.match(/^\/api\/miniapps\/([^/]+)\/campaign$/);
      if (req.method === 'POST' && miniappCampaignMatch) {
        const body = await readBody(req);
        sendJson(res, 201, store.createCampaignFromMiniapp(miniappCampaignMatch[1], body));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/targets') {
        const body = await readBody(req);
        sendJson(res, 201, store.createTarget(body));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/targets/bulk') {
        const body = await readBody(req);
        const labels = splitTargetLabels(body.labels);
        sendJson(res, 201, { created: store.createTargets({ ...body, labels }) });
        return;
      }

      const targetDeleteMatch = url.pathname.match(/^\/api\/targets\/([^/]+)$/);
      if (req.method === 'DELETE' && targetDeleteMatch) {
        const deleted = store.deleteTarget(targetDeleteMatch[1]);
        if (!deleted) {
          sendJson(res, 404, { error: 'TARGET_NOT_FOUND' });
          return;
        }
        sendJson(res, 200, deleted);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/drafts/generate') {
        const body = await readBody(req);
        const campaign = store.getCampaign(body.campaignId);
        if (!campaign) {
          sendJson(res, 404, { error: 'CAMPAIGN_NOT_FOUND' });
          return;
        }
        sendJson(res, 201, createDraftsForCampaign({ store, campaign, targetIds: body.targetIds }));
        return;
      }

      const statusMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)\/status$/);
      if (req.method === 'PATCH' && statusMatch) {
        const body = await readBody(req);
        sendJson(res, 200, store.updateDraftStatus(statusMatch[1], body.status));
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'NOT_FOUND' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      serveStatic(req, res, staticDir);
    } catch (error) {
      const status = [
        'INVALID_JSON',
        'BODY_TOO_LARGE',
        'INVALID_WECHAT_CREDENTIALS',
        'WECHAT_ACCESS_TOKEN_MISSING'
      ].includes(error.message)
        ? 400
        : 500;
      sendJson(res, status, { error: error.message || 'INTERNAL_ERROR' });
    }
  };
}
