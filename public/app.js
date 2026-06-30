const state = {
  wechatPersonal: {},
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
    ['目标', state.metrics.totalTargets || 0],
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

function connectionBadge(status) {
  if (status === 'connected') return '<span class="badge ok">已连接</span>';
  if (status === 'waiting_scan') return '<span class="badge warn">待扫码</span>';
  return '<span class="badge">未连接</span>';
}

function renderConnectionSummary() {
  const miniappCount = state.miniapps.filter((item) => item.source === 'wechat_official').length;
  const wechatStatus = state.wechatPersonal?.status || 'disconnected';
  $('#connectionSummary').innerHTML = `
    <span class="summary-chip">小程序 ${miniappCount}</span>
    <span class="summary-chip">微信 ${wechatStatus === 'connected' ? '已连接' : wechatStatus === 'waiting_scan' ? '待扫码' : '未连接'}</span>
  `;
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
    $('#miniappList').innerHTML = '<div class="empty">还没有小程序资料。</div>';
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

function renderLoginGuide(personal = {}) {
  const guide = $('#wechatLoginGuide');
  const status = personal.status || 'disconnected';
  const copy = {
    connected: {
      title: 'WCF 连接已确认',
      body: '可以同步微信群目标，仍然只生成草稿，不自动发送。'
    },
    waiting_scan: {
      title: '等待官方 Windows 微信扫码',
      body: '请在 Windows 微信客户端里完成真实扫码，再检测或确认 WCF 桥接器。'
    },
    disconnected: {
      title: '先打开官方 Windows 微信',
      body: '真实二维码只在微信客户端里显示；网页不会生成可扫描二维码。'
    }
  }[status] || {
    title: '先打开官方 Windows 微信',
    body: '真实二维码只在微信客户端里显示；网页不会生成可扫描二维码。'
  };

  guide.className = `login-guide ${status}`;
  guide.innerHTML = `
    <span class="guide-kicker">官方 Windows 微信</span>
    <strong>${escapeHtml(copy.title)}</strong>
    <span>${escapeHtml(copy.body)}</span>
  `;
}

function renderWechatPersonal() {
  const personal = state.wechatPersonal || {};
  $('#wechatPersonalStatus').innerHTML = `${connectionBadge(personal.status)} ${escapeHtml(personal.displayName || '个人微信')}`;
  $('#wechatPersonalNote').textContent = personal.syncNote || '官方 Windows 微信扫码登录后，通过 WCF 同步微信群目标；不自动群发。';
  renderLoginGuide(personal);
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
    $('#targetList').innerHTML = '<div class="empty">还没有转发目标。</div>';
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
  renderConnectionSummary();
  renderMetrics();
  renderWechatPersonal();
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
    setAuthStatus('idle', '等待小程序授权信息');
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
    toast('小程序授权成功，活动已创建');
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
    setAuthStatus('idle', '等待小程序授权信息');
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

async function startWechatLogin() {
  const connection = await api('/api/wechat-personal/login/start', {
    method: 'POST',
    body: { mode: 'wcf_http' }
  });
  state.wechatPersonal = connection;
  renderWechatPersonal();
  renderConnectionSummary();
  toast('请在官方 Windows 微信客户端完成扫码登录');
}

async function confirmWechatLogin() {
  const connection = await api('/api/wechat-personal/login/confirm', {
    method: 'POST',
    body: { displayName: '个人微信小号' }
  });
  state.wechatPersonal = connection;
  renderWechatPersonal();
  renderConnectionSummary();
  toast('微信连接已确认');
}

async function syncWechatTargets(form) {
  const values = formData(form);
  const labels = parseTargetLabels(values.labels);
  if (!labels.length) {
    toast('没有可同步的群名');
    return;
  }
  const result = await api('/api/wechat-personal/sync-targets', {
    method: 'POST',
    body: {
      labels,
      kind: 'group',
      allowed: true,
      riskLevel: 'low',
      note: '微信同步目标'
    }
  });
  form.reset();
  toast(`已同步 ${result.created.length} 个转发目标`);
  await loadState();
}

async function addManualTargets(form) {
  const values = formData(form);
  const labels = parseTargetLabels(values.labels);
  if (!labels.length) {
    toast('没有可添加的目标');
    return;
  }
  const result = await api('/api/targets/bulk', {
    method: 'POST',
    body: {
      labels,
      kind: 'group',
      allowed: true,
      riskLevel: 'low',
      note: '手动补充目标'
    }
  });
  form.reset();
  toast(`已添加 ${result.created.length} 个目标`);
  await loadState();
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

$('#wechatSyncForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  await syncWechatTargets(event.currentTarget);
});

$('#targetForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  await addManualTargets(event.currentTarget);
});

document.body.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'clear-wechat-auth') {
    clearTimeout(authTimer);
    $('#wechatConnectForm').reset();
    setAuthStatus('idle', '等待小程序授权信息');
    return;
  }

  if (action === 'start-wechat-login') {
    await startWechatLogin();
    return;
  }

  if (action === 'confirm-wechat-login') {
    await confirmWechatLogin();
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
    toast('目标已删除');
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
