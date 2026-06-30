function compactText(value) {
  return String(value || '').trim();
}

export function parseWechatAuthorizationText(input = {}) {
  const text = compactText(input.authorizationText || input.text || '');
  const joined = [input.appId, input.appSecret, text].filter(Boolean).join('\n');

  const explicitAppId = compactText(input.appId);
  const explicitSecret = compactText(input.appSecret);
  const appId =
    explicitAppId ||
    joined.match(/(?:app\s*id|appid|小程序\s*id|小程序id)[\s:：=]+(wx[a-zA-Z0-9_-]{6,})/i)?.[1] ||
    joined.match(/\b(wx[a-zA-Z0-9_-]{6,})\b/i)?.[1] ||
    '';
  const secret =
    explicitSecret ||
    joined.match(/(?:app\s*secret|appsecret|secret|密钥|秘钥)[\s:：=]+([a-zA-Z0-9_-]{8,})/i)?.[1] ||
    joined
      .split(/[\s,，;；]+/g)
      .map((item) => item.trim())
      .find((item) => item && item !== appId && /^[a-zA-Z0-9_-]{16,}$/.test(item)) ||
    '';

  return {
    appId: appId.trim(),
    appSecret: secret.trim()
  };
}

function assertCredentials({ appId, appSecret }) {
  if (!/^wx[a-zA-Z0-9_-]{6,}$/.test(appId) || !appSecret) {
    throw new Error('INVALID_WECHAT_CREDENTIALS');
  }
}

function normalizeToolId(value, appId) {
  const ascii = compactText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return ascii || `wx_${appId.slice(-6).toLowerCase()}`;
}

function pickAccountName(info, appId) {
  const candidates = [
    info?.nickname,
    info?.name,
    info?.accountName,
    info?.account_name,
    info?.nickname_info?.nickname,
    info?.basic_info?.nickname
  ];
  return candidates.map(compactText).find(Boolean) || `微信小程序 ${appId.slice(-6)}`;
}

function pickGoal(info, appName) {
  const categories = [info?.categories, info?.category_list, info?.service_category_info?.category_list]
    .flat()
    .filter(Boolean)
    .map((item) => compactText(item?.first || item?.second || item?.name || item))
    .filter(Boolean)
    .slice(0, 3);
  const signature = compactText(
    info?.signature ||
      info?.signature_info?.signature ||
      info?.basic_info?.signature ||
      info?.principal_name
  );
  if (signature) return signature;
  if (categories.length) return `${appName}：${categories.join('、')}`;
  return `推广 ${appName}`;
}

function normalizePath(value) {
  const raw = compactText(value);
  if (!raw) return '';
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return path.split('?')[0] || '';
}

function pickFirstPath(pageInfo) {
  const pageList = pageInfo?.page_list || pageInfo?.pageList || pageInfo?.pages || pageInfo?.pagepath || [];
  const pages = Array.isArray(pageList) ? pageList : [pageList];
  for (const page of pages) {
    const path = normalizePath(page?.path || page?.page_path || page?.pagePath || page);
    if (path) return path;
  }
  return '';
}

async function requestWechatJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`WECHAT_HTTP_${response.status}`);
  }
  const body = await response.json();
  if (body.errcode && body.errcode !== 0) {
    const error = new Error(body.errmsg || `WECHAT_API_${body.errcode}`);
    error.code = body.errcode;
    throw error;
  }
  return body;
}

async function optionalWechatJson(fetchImpl, url) {
  try {
    return await requestWechatJson(fetchImpl, url);
  } catch (error) {
    return {
      unavailable: true,
      message: error.message || 'WECHAT_OPTIONAL_API_FAILED'
    };
  }
}

export function createWechatMiniappClient({ fetchImpl = fetch } = {}) {
  return {
    async importMiniapp(input = {}) {
      const credentials = parseWechatAuthorizationText(input);
      assertCredentials(credentials);

      const tokenUrl = new URL('https://api.weixin.qq.com/cgi-bin/token');
      tokenUrl.searchParams.set('grant_type', 'client_credential');
      tokenUrl.searchParams.set('appid', credentials.appId);
      tokenUrl.searchParams.set('secret', credentials.appSecret);

      const token = await requestWechatJson(fetchImpl, tokenUrl);
      if (!token.access_token) {
        throw new Error('WECHAT_ACCESS_TOKEN_MISSING');
      }

      const accountUrl = new URL('https://api.weixin.qq.com/cgi-bin/account/getaccountbasicinfo');
      accountUrl.searchParams.set('access_token', token.access_token);
      const accountInfo = await optionalWechatJson(fetchImpl, accountUrl);

      const pageUrl = new URL('https://api.weixin.qq.com/wxa/get_page');
      pageUrl.searchParams.set('access_token', token.access_token);
      const pageInfo = await optionalWechatJson(fetchImpl, pageUrl);

      const appName = pickAccountName(accountInfo.unavailable ? null : accountInfo, credentials.appId);
      const miniappPath = pickFirstPath(pageInfo.unavailable ? null : pageInfo) || '/pages/index/index';
      const syncMessageParts = ['授权检测成功'];
      if (accountInfo.unavailable) syncMessageParts.push('账号资料接口未返回可用信息');
      if (pageInfo.unavailable) syncMessageParts.push('页面路径未同步，已使用默认首页路径');

      return {
        appId: credentials.appId,
        appName,
        toolId: normalizeToolId(appName, credentials.appId),
        toolName: appName,
        miniappPath,
        goal: pickGoal(accountInfo.unavailable ? null : accountInfo, appName),
        dailyLimit: 20,
        syncStatus: 'connected',
        syncMessage: syncMessageParts.join('；')
      };
    }
  };
}
