const state = {
  miniapps: [],
  campaigns: [],
  targets: [],
  drafts: [],
  metrics: {}
};

const MINIAPP_PRESETS = {
  compress: {
    appName: '图片压缩工具',
    name: '图片压缩冷启动',
    toolId: 'compress',
    toolName: '图片压缩',
    miniappPath: '/pages/compress/compress',
    goal: '帮助用户在微信里快速压缩图片，减少上传失败',
    dailyLimit: 20
  },
  qrcode: {
    appName: '二维码工具',
    name: '二维码工具推广',
    toolId: 'qrcode',
    toolName: '二维码生成',
    miniappPath: '/pages/qrcode/qrcode',
    goal: '帮助用户快速生成可保存、可转发的二维码',
    dailyLimit: 20
  },
  wordcount: {
    appName: '字数统计工具',
    name: '字数统计推广',
    toolId: 'wordcount',
    toolName: '字数统计',
    miniappPath: '/pages/wordcount/wordcount',
    goal: '帮助写文案、发朋友圈、做报价说明时快速统计字数',
    dailyLimit: 20
  },
  teleprompter: {
    appName: '提词器工具',
    name: '提词器推广',
    toolId: 'teleprompter',
    toolName: '提词器',
    miniappPath: '/pages/teleprompter/teleprompter',
    goal: '帮助拍短视频、做口播时照着稿子更顺畅',
    dailyLimit: 15
  },
  grid9: {
    appName: '九宫格切图工具',
    name: '九宫格切图推广',
    toolId: 'grid9',
    toolName: '九宫格切图',
    miniappPath: '/pages/grid9/grid9',
    goal: '帮助朋友圈和社群发图时快速做九宫格效果',
    dailyLimit: 15
  }
};

const $ = (selector) => document.querySelector(selector);

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

function renderMiniapps() {
  const select = $('#miniappSelect');
  select.innerHTML = [
    '<option value="">选择一个小程序资料</option>',
    ...state.miniapps.map((miniapp) => `
      <option value="${escapeHtml(miniapp.id)}">${escapeHtml(miniapp.appName)} · ${escapeHtml(miniapp.toolName)}</option>
    `)
  ].join('');

  if (!state.miniapps.length) {
    $('#miniappList').innerHTML = '<div class="empty">还没有小程序资料。先保存一个常用小程序。</div>';
    return;
  }

  $('#miniappList').innerHTML = state.miniapps
    .map((miniapp) => `
      <article class="row-card miniapp-card">
        <div class="row-top">
          <div>
            <p class="row-title">${escapeHtml(miniapp.appName)}</p>
            <p class="row-meta">${escapeHtml(miniapp.toolName)} · ${escapeHtml(miniapp.miniappPath)}</p>
            <p class="row-meta">${escapeHtml(miniapp.goal || '没有填写推广目标')}</p>
          </div>
          <span class="badge">${escapeHtml(miniapp.source || 'manual')}</span>
        </div>
        <div class="actions">
          <button class="small-button" data-action="apply-miniapp" data-id="${miniapp.id}" type="button">填入活动</button>
          <button class="small-button" data-action="create-miniapp-campaign" data-id="${miniapp.id}" type="button">直接建活动</button>
        </div>
      </article>
    `)
    .join('');
}

function renderCampaigns() {
  if (!state.campaigns.length) {
    $('#campaignList').innerHTML = '<div class="empty">还没有活动。</div>';
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
  return `<span class="badge ${className}">${label}</span>`;
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

function setFormValues(form, values) {
  for (const [key, value] of Object.entries(values)) {
    if (form.elements[key]) {
      form.elements[key].value = value ?? '';
    }
  }
}

function selectedMiniapp() {
  const id = $('#miniappSelect').value;
  return state.miniapps.find((miniapp) => miniapp.id === id) || null;
}

function fillCampaignFromMiniapp(miniapp) {
  const form = $('#campaignForm');
  setFormValues(form, {
    name: `${miniapp.appName}推广`,
    toolId: miniapp.toolId,
    toolName: miniapp.toolName,
    miniappPath: miniapp.miniappPath,
    goal: miniapp.goal,
    dailyLimit: String(miniapp.dailyLimit)
  });
  $('#miniappSelect').value = miniapp.id;
  toast(`已填入「${miniapp.appName}」`);
}

function applyMiniappPreset(presetId) {
  const preset = MINIAPP_PRESETS[presetId];
  const form = $('#miniappForm');
  if (!preset || !form) return;

  setFormValues(form, {
    appName: preset.appName,
    toolId: preset.toolId,
    toolName: preset.toolName,
    miniappPath: preset.miniappPath,
    goal: preset.goal,
    dailyLimit: String(preset.dailyLimit)
  });
  toast(`已填入「${preset.toolName}」模板`);
}

async function createCampaignFromMiniapp(miniapp) {
  const campaignForm = $('#campaignForm');
  const values = formData(campaignForm);
  const name = String(values.name || '').trim() || `${miniapp.appName}推广`;
  await api(`/api/miniapps/${miniapp.id}/campaign`, {
    method: 'POST',
    body: { name }
  });
  toast(`已为「${miniapp.appName}」创建活动`);
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

$('#miniappForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formData(form);
  const miniapp = await api('/api/miniapps', {
    method: 'POST',
    body: {
      ...values,
      dailyLimit: Number(values.dailyLimit || 20),
      source: 'manual'
    }
  });
  form.reset();
  form.elements.dailyLimit.value = '20';
  toast('小程序资料已保存');
  await loadState();
  $('#miniappSelect').value = miniapp.id;
  fillCampaignFromMiniapp(miniapp);
});

$('#campaignForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formData(form);
  await api('/api/campaigns', {
    method: 'POST',
    body: {
      ...values,
      dailyLimit: Number(values.dailyLimit || 20)
    }
  });
  form.reset();
  form.elements.dailyLimit.value = '20';
  toast('活动已创建');
  await loadState();
});

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
  const presetButton = event.target.closest('button[data-miniapp-preset]');
  if (presetButton) {
    applyMiniappPreset(presetButton.dataset.miniappPreset);
    return;
  }

  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'scan-login') {
    toast('扫码导入需要微信官方接口；当前先用资料库切换');
    return;
  }

  if (action === 'apply-selected-miniapp') {
    const miniapp = selectedMiniapp();
    if (!miniapp) {
      toast('先选择一个小程序资料');
      return;
    }
    fillCampaignFromMiniapp(miniapp);
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

  if (action === 'apply-miniapp') {
    const miniapp = state.miniapps.find((item) => item.id === id);
    if (!miniapp) return;
    fillCampaignFromMiniapp(miniapp);
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
