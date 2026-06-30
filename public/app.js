const state = {
  miniapps: [],
  campaigns: [],
  targets: [],
  drafts: [],
  metrics: {}
};

const $ = (selector) => document.querySelector(selector);

let authTimer = null;
let authRequestId = 0;
let lastSuccessfulAuthText = '';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1800);
}

function humanError(error) {
  const message = error?.message || 'REQUEST_FAILED';
  return {
    INVALID_WECHAT_CREDENTIALS: '没有识别到有效的 AppID 和 AppSecret',
    WECHAT_ACCESS_TOKEN_MISSING: '微信没有返回 access_token',
    WECHAT_HTTP_401: '微信接口拒绝访问，请检查 AppID/AppSecret',
    WECHAT_HTTP_403: '微信接口权限不足，请检查小程序后台配置'
  }[message] || message;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || 'REQUEST_FAILED');
  }
  return body;
}

async function loadState() {
  const next = await api('/api/state');
  Object.assign(state, next);
  render();
}

function splitAListChunk(chunk) {
  const value = chunk.trim();
  const split = value.split(/\s+(?=A[\u4e00-\u9fa5A-Za-z0-9])/g);
  return split.length > 1 ? split : [value];
}

function parseTargetLabels(value) {
  const seen = new Set();
  return String(value || '')
    .split(/[\r\n,，;；]+/g)
    .flatMap(splitAListChunk)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item && item.length <= 120)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function renderMetrics() {
  const metrics = [
    ['白名单', state.metrics.totalTargets || 0],
    ['待处理', state.metrics.queuedDrafts || 0],
    ['已复制', state.metrics.copiedDrafts || 0],
    ['已发送', state.metrics.sentDrafts || 0]
  ];
  $('#metrics').innerHTML = metrics
    .map(([label, value]) => `
      <div class="metric">
        <strong>${value}</strong>
        <span>${label}</span>
      </div>
    `)
    .join('');
}

function miniappStatusBadge(miniapp) {
  const status = miniapp.syncStatus || miniapp.source || 'manual';
  const className = status === 'connected' ? 'ok' : status === 'failed' ? 'danger' : '';
  const label = {
    connected: '已授权',
    failed: '检测失败',
    manual: '本地资料',
    preset: '预设'
  }[status] || status;
  return `<span class="badge ${className}">${escapeHtml(label)}</span>`;
}

function sourceLabel(miniapp) {
  if (miniapp.appId) return `AppID ${miniapp.appId}`;
  return miniapp.source || '本地资料';
}

function renderMiniapps() {
  const select = $('#miniappSelect');
  select.innerHTML = [
    '<option value="">选择一个小程序资料</option>',
    ...state.miniapps.map((miniapp) => `
      <option value="${escapeHtml(miniapp.id)}">${escapeHtml(miniapp.appName)} · ${escapeHtml(miniapp.toolName)}</option>
    `)
  ].join('');

  if (!state.miniapps.length) {
    $('#miniappList').innerHTML = '<div class="empty">还没有小程序资料。先粘贴 AppID/AppSecret 完成授权检测。</div>';
    return;
  }

  $('#miniappList').innerHTML = state.miniapps
    .map((miniapp) => `
      <article class="row-card miniapp-card">
        <div class="row-top">
          <div>
            <p class="row-title">${escapeHtml(miniapp.appName)}</p>
            <p class="row-meta">${escapeHtml(miniapp.toolName)} · ${escapeHtml(miniapp.miniappPath)}</p>
            <p class="row-meta">${escapeHtml(sourceLabel(miniapp))}</p>
            <p class="row-meta">${escapeHtml(miniapp.syncMessage || miniapp.goal || '没有同步说明')}</p>
          </div>
          ${miniappStatusBadge(miniapp)}
        </div>
        <div class="actions">
          <button class="small-button" data-action="create-miniapp-campaign" data-id="${miniapp.id}" type="button">创建活动</button>
        </div>
      </article>
    `)
    .join('');
}

function renderCampaigns() {
  if (!state.campaigns.length) {
    $('#campaignList').innerHTML = '<div class="empty">还没有活动。先接入小程序，系统会自动创建。</div>';
    return;
  }

  $('#campaignList').innerHTML = state.campaigns
    .map((campaign) => `
      <article class="row-card">
        <div class="row-top">
          <div>
            <p class="row-title">${escapeHtml(campaign.name)}</p>
            <p class="row-meta">${escapeHtml(campaign.toolName)} · ${escapeHtml(campaign.miniappPath)}</p>
            <p class="row-meta">${escapeHtml(campaign.goal || '没有填写推广目标')}</p>
          </div>
          <span class="badge">上限 ${campaign.dailyLimit}/天</span>
        </div>
        <div class="actions">
          <button class="small-button" data-action="generate" data-id="${campaign.id}" type="button">生成草稿</button>
        </div>
      </article>
    `)
    .join('');
}

function badgeForTarget(target) {
  if (!target.allowed) return '<span class="badge danger">禁用</span>';
  if (target.riskLevel === 'high') return '<span class="badge danger">高风险</span>';
  if (target.riskLevel === 'medium') return '<span class="badge warn">中风险</span>';
  return '<span class="badge ok">允许</span>';
}

function renderTargets() {
  if (!state.targets.length) {
    $('#targetList').innerHTML = '<div class="empty">还没有白名单目标。</div>';
    return;
  }

  $('#targetList').innerHTML = state.targets
    .map((target) => `
      <article class="row-card">
        <div class="row-top">
          <div>
            <p class="row-title">${escapeHtml(target.label)}</p>
            <p class="row-meta">${escapeHtml(target.kind)} · ${escapeHtml(target.note || '无备注')}</p>
          </div>
          ${badgeForTarget(target)}
        </div>
        <div class="actions">
          <button class="small-button danger-button" data-action="delete-target" data-id="${target.id}" type="button">删除</button>
        </div>
      </article>
    `)
    .join('');
}

function statusBadge(status) {
  const className = status === 'sent' ? 'ok' : status === 'skipped' ? 'danger' : status === 'copied' ? 'warn' : '';
  const label = {
    queued: '待处理',
    copied: '已复制',
    sent: '已发送',
    skipped: '已跳过'
  }[status] || status;
  return `<span class="badge ${className}">${escapeHtml(label)}</span>`;
}

function renderDrafts() {
  if (!state.drafts.length) {
    $('#draftList').innerHTML = '<div class="empty">还没有草稿。先在活动里点击“生成草稿”。</div>';
    return;
  }

  $('#draftList').innerHTML = state.drafts
    .map((draft) => `
      <article class="row-card">
        <div class="row-top">
          <div>
            <p class="row-title">${escapeHtml(draft.targetLabel)} · ${escapeHtml(draft.campaignName)}</p>
            <p class="row-meta">${escapeHtml(draft.sourceCode)}</p>
          </div>
          ${statusBadge(draft.status)}
        </div>
        <pre class="draft-body">${escapeHtml(draft.body)}</pre>
        <div class="actions">
          <button class="small-button" data-action="copy" data-id="${draft.id}" type="button">复制</button>
          <button class="small-button" data-action="sent" data-id="${draft.id}" type="button">标记发送</button>
          <button class="small-button" data-action="skip" data-id="${draft.id}" type="button">跳过</button>
        </div>
      </article>
    `)
    .join('');
}

function render() {
  renderMetrics();
  renderMiniapps();
  renderCampaigns();
  renderTargets();
  renderDrafts();
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function selectedMiniapp() {
  const id = $('#miniappSelect').value;
  return state.miniapps.find((miniapp) => miniapp.id === id) || null;
}

function setAuthStatus(status, message) {
  const el = $('#wechatAuthStatus');
  el.className = `auth-status ${status}`;
  el.textContent = message;
}

function looksLikeWechatAuth(value) {
  return /\bwx[a-zA-Z0-9_-]{6,}\b/.test(value) && /[a-zA-Z0-9_-]{16,}/.test(value.replace(/\bwx[a-zA-Z0-9_-]{6,}\b/, ''));
}

async function createCampaignFromMiniapp(miniapp, { silent = false } = {}) {
  const campaign = await api(`/api/miniapps/${miniapp.id}/campaign`, {
    method: 'POST',
    body: { name: `${miniapp.appName}推广` }
  });
  await loadState();
  const select = $('#miniappSelect');
  if (select) select.value = miniapp.id;
  if (!silent) toast(`已创建「${campaign.name}」`);
  return campaign;
}

async function connectWechatMiniapp({ auto = false } = {}) {
  const form = $('#wechatConnectForm');
  const authorizationText = form.elements.authorizationText.value.trim();
  if (!authorizationText) {
    setAuthStatus('idle', '等待输入 AppID 和 AppSecret');
    return;
  }
  if (!looksLikeWechatAuth(authorizationText)) {
    setAuthStatus(auto ? 'idle' : 'failed', auto ? '继续输入，系统会自动识别 AppID 和 AppSecret' : '没有识别到完整 AppID 和 AppSecret');
    return;
  }
  if (auto && authorizationText === lastSuccessfulAuthText) {
    return;
  }

  const requestId = ++authRequestId;
  setAuthStatus('checking', '正在检测微信授权...');
  try {
    const miniapp = await api('/api/wechat-miniapps/connect', {
      method: 'POST',
      body: { authorizationText }
    });
    if (requestId !== authRequestId) return;
    lastSuccessfulAuthText = authorizationText;
    form.reset();
    const campaign = await createCampaignFromMiniapp(miniapp, { silent: true });
    if (requestId !== authRequestId) return;
    setAuthStatus('success', `授权成功，已创建「${campaign.name}」`);
    toast('微信小程序授权成功，活动已创建');
  } catch (error) {
    if (requestId !== authRequestId) return;
    setAuthStatus('failed', `检测失败：${humanError(error)}`);
    if (!auto) toast(humanError(error));
  }
}

function scheduleWechatConnect() {
  const value = $('#wechatAuthorizationText').value.trim();
  clearTimeout(authTimer);
  if (!value) {
    setAuthStatus('idle', '等待输入 AppID 和 AppSecret');
    return;
  }
  if (!looksLikeWechatAuth(value)) {
    setAuthStatus('idle', '继续输入，系统会自动识别 AppID 和 AppSecret');
    return;
  }
  setAuthStatus('checking', '已识别授权信息，稍后自动检测...');
  authTimer = setTimeout(() => {
    connectWechatMiniapp({ auto: true });
  }, 900);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

$('#wechatConnectForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearTimeout(authTimer);
  await connectWechatMiniapp({ auto: false });
});

$('#wechatAuthorizationText').addEventListener('input', scheduleWechatConnect);

$('#targetForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formData(form);
  const labels = parseTargetLabels(values.labels);
  if (!labels.length) {
    toast('没有可添加的名称；请一行一个粘贴群名');
    return;
  }
  const result = await api('/api/targets/bulk', {
    method: 'POST',
    body: {
      ...values,
      labels,
      allowed: values.allowed === 'on'
    }
  });
  form.reset();
  form.elements.allowed.checked = true;
  toast(`已添加 ${result.created.length} 个白名单`);
  await loadState();
});

document.body.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'clear-wechat-auth') {
    clearTimeout(authTimer);
    $('#wechatConnectForm').reset();
    setAuthStatus('idle', '等待输入 AppID 和 AppSecret');
    return;
  }

  if (action === 'create-selected-miniapp') {
    const miniapp = selectedMiniapp();
    if (!miniapp) {
      toast('先选择一个小程序资料');
      return;
    }
    await createCampaignFromMiniapp(miniapp);
    return;
  }

  if (action === 'create-miniapp-campaign') {
    const miniapp = state.miniapps.find((item) => item.id === id);
    if (!miniapp) return;
    await createCampaignFromMiniapp(miniapp);
    return;
  }

  if (action === 'generate') {
    const result = await api('/api/drafts/generate', {
      method: 'POST',
      body: { campaignId: id }
    });
    toast(`生成 ${result.created.length} 条，拦截 ${result.blocked.length} 条`);
    await loadState();
    return;
  }

  if (action === 'delete-target') {
    const target = state.targets.find((item) => item.id === id);
    if (!target) return;
    if (!window.confirm(`删除「${target.label}」？关联草稿也会一起删除。`)) return;
    await api(`/api/targets/${id}`, { method: 'DELETE' });
    toast('白名单已删除');
    await loadState();
    return;
  }

  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;

  if (action === 'copy') {
    await copyText(draft.body);
    await api(`/api/drafts/${id}/status`, { method: 'PATCH', body: { status: 'copied' } });
    toast('草稿已复制');
    await loadState();
  }

  if (action === 'sent') {
    await api(`/api/drafts/${id}/status`, { method: 'PATCH', body: { status: 'sent' } });
    toast('已标记发送');
    await loadState();
  }

  if (action === 'skip') {
    await api(`/api/drafts/${id}/status`, { method: 'PATCH', body: { status: 'skipped' } });
    toast('已跳过');
    await loadState();
  }
});

$('#refreshBtn').addEventListener('click', loadState);

loadState().catch((error) => {
  console.error(error);
  toast(error.message || '加载失败');
});
