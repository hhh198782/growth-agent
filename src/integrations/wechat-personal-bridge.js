const DEFAULT_BASE_URL = 'http://127.0.0.1:9999';

function pickArray(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) return value;
  }
  for (const key of keys) {
    const value = payload?.data?.[key];
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeConversation(item) {
  const wxid = String(item.wxid || item.wx_id || item.id || item.userName || item.username || '').trim();
  const displayName = String(
    item.displayName || item.display_name || item.name || item.nickName || item.nickname || item.remark || wxid
  ).trim();
  const kind = wxid.endsWith('@chatroom') || item.type === 'group' || item.kind === 'group' ? 'group' : 'friend';
  return {
    wxid,
    displayName,
    kind,
    remark: String(item.remark || '').trim(),
    lastMessage: String(item.lastMessage || item.last_msg || '').trim(),
    lastMessageAt: String(item.lastMessageAt || item.last_msg_at || item.updatedAt || '').trim(),
    unreadCount: Number(item.unreadCount || item.unread_count || 0),
    allowAi: false
  };
}

function normalizeMessage(item) {
  return {
    wxid: String(item.wxid || item.roomid || item.roomId || item.conversationId || '').trim(),
    externalId: String(item.msgId || item.msgid || item.id || '').trim(),
    senderName: String(item.senderName || item.sender || item.fromUser || '').trim(),
    direction: item.isSelf || item.direction === 'outbound' ? 'outbound' : 'inbound',
    body: String(item.body || item.content || item.text || '').trim(),
    messageType: String(item.type || item.messageType || 'text').trim(),
    sentAt: String(item.sentAt || item.createTime || item.time || '').trim()
  };
}

function humanBridgeError(error, baseUrl) {
  const message = String(error?.message || error || '');
  if (message === 'fetch failed' || /ECONNREFUSED|UND_ERR_CONNECT_TIMEOUT|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return `未启动 WCF HTTP 桥接器；请先启动 wcf-http-server，默认地址 ${baseUrl}`;
  }
  if (/WCF_HTTP_404/.test(message)) {
    return `已连接到 ${baseUrl}，但接口路径不匹配；请检查 WCF_STATUS_PATH/WCF_CONTACTS_PATH 配置`;
  }
  return message || 'WCF_BRIDGE_UNREACHABLE';
}

async function requestJson(fetchImpl, url, { timeoutMs = 2500 } = {}) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`WCF_HTTP_${response.status}`);
  }
  const text = await response.text();
  if (!text) return {};
  return JSON.parse(text);
}

export function createWechatPersonalBridge({
  baseUrl = process.env.WCF_HTTP_URL || DEFAULT_BASE_URL,
  fetchImpl = fetch,
  paths = {}
} = {}) {
  const normalizedBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const statusPaths = [
    paths.status || process.env.WCF_STATUS_PATH,
    '/api/status',
    '/status',
    '/api/userinfo',
    '/userinfo',
    '/self'
  ].filter(Boolean);
  const contactPaths = [
    paths.contacts || process.env.WCF_CONTACTS_PATH,
    '/api/contacts',
    '/contacts',
    '/api/contact/list',
    '/contact/list'
  ].filter(Boolean);
  const messagePaths = [
    paths.messages || process.env.WCF_MESSAGES_PATH,
    '/api/messages',
    '/messages',
    '/api/message/list',
    '/message/list'
  ].filter(Boolean);

  async function firstJson(pathsToTry, query = '') {
    let lastError = null;
    for (const path of pathsToTry) {
      try {
        const url = `${normalizedBaseUrl}${path}${query}`;
        return await requestJson(fetchImpl, url);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('WCF_BRIDGE_UNREACHABLE');
  }

  return {
    baseUrl: normalizedBaseUrl,

    async status() {
      try {
        const payload = await firstJson(statusPaths);
        const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
        return {
          connected: true,
          mode: 'wcf_http',
          baseUrl: normalizedBaseUrl,
          wxid: String(data.wxid || data.wx_id || data.id || '').trim(),
          displayName: String(data.name || data.nickname || data.displayName || data.userName || '个人微信').trim(),
          message: 'WCF bridge reachable'
        };
      } catch (error) {
        return {
          connected: false,
          mode: 'wcf_http',
          baseUrl: normalizedBaseUrl,
          message: humanBridgeError(error, normalizedBaseUrl)
        };
      }
    },

    async syncConversations({ limit = 50 } = {}) {
      const contactsPayload = await firstJson(contactPaths);
      const conversations = pickArray(contactsPayload, ['contacts', 'items', 'friends', 'rooms', 'chatrooms'])
        .map(normalizeConversation)
        .filter((item) => item.wxid && item.displayName)
        .slice(0, Math.max(1, Math.min(200, Number(limit || 50))));

      return { conversations, messages: [] };
    },

    async syncMessages({ wxid, limit = 20 } = {}) {
      const query = `?wxid=${encodeURIComponent(wxid)}&limit=${Math.max(1, Math.min(100, Number(limit || 20)))}`;
      const payload = await firstJson(messagePaths, query);
      const messages = pickArray(payload, ['messages', 'items', 'rows'])
        .map(normalizeMessage)
        .filter((item) => item.body)
        .map((item) => ({ ...item, wxid: item.wxid || wxid }));
      return { messages };
    }
  };
}
