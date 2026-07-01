function recentMessagesText(messages = []) {
  return messages
    .slice(-8)
    .map((message) => `${message.senderName || (message.direction === 'outbound' ? '我' : '对方')}: ${message.body}`)
    .join('\n');
}

function fallbackReply({ conversation, campaign, sourcePath, userPrompt }) {
  const target = conversation?.kind === 'group' ? `群里` : `你`;
  const intent = String(userPrompt || '').trim();
  return [
    intent || `刚看到${target}在聊这个问题，我做了一个可以直接在微信里用的小工具。`,
    '',
    `工具：${campaign.toolName}`,
    campaign.goal ? `用途：${campaign.goal}` : '用途：处理一个具体的小任务，不用额外下载 App。',
    `小程序路径：${sourcePath}`,
    '',
    '我先发给你参考，合不合适你自己看；发送前我会再人工确认。'
  ].join('\n');
}

export function createAiReplyClient({
  fetchImpl = fetch,
  apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
  baseUrl = process.env.AI_API_BASE_URL || 'https://api.deepseek.com',
  model = process.env.AI_MODEL || 'deepseek-v4-flash'
} = {}) {
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/+$/, '');

  return {
    configured: Boolean(apiKey && normalizedBaseUrl),

    async generateReply(input = {}) {
      const { conversation, campaign, messages = [], sourcePath, userPrompt } = input;
      const runtimeConfig = input.aiConfig || {};
      const runtimeApiKey = runtimeConfig.apiKey || apiKey;
      const runtimeBaseUrl = String(runtimeConfig.baseUrl || normalizedBaseUrl || '').replace(/\/+$/, '');
      const runtimeModel = runtimeConfig.model || model;

      if (!runtimeApiKey || !runtimeBaseUrl) {
        return {
          body: fallbackReply({ conversation, campaign, sourcePath, userPrompt }),
          provider: 'local-template',
          safetyNote: '未配置大模型 API Key，使用本地模板生成；发送前需要人工确认。'
        };
      }

      const prompt = [
        '你是微信小程序推广助手，只写可人工审核的微信回复草稿。',
        '要求：自然、简短、不要骚扰、不要承诺自动群发、不要假装你已经发送。',
        '必须包含给定的小程序路径。不要输出 JSON。',
        '',
        `会话：${conversation.displayName}`,
        `工具：${campaign.toolName}`,
        `推广目标：${campaign.goal || '帮助用户完成一个具体任务'}`,
        `小程序路径：${sourcePath}`,
        '',
        '最近消息：',
        recentMessagesText(messages) || '暂无最近消息',
        '',
        userPrompt ? `额外要求：${userPrompt}` : ''
      ].join('\n');

      const response = await fetchImpl(`${runtimeBaseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: {
          authorization: `Bearer ${runtimeApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: runtimeModel,
          temperature: 0.5,
          messages: [
            { role: 'system', content: '你只生成微信回复草稿，不能要求自动发送。' },
            { role: 'user', content: prompt }
          ]
        })
      });
      if (!response.ok) {
        throw new Error(`AI_HTTP_${response.status}`);
      }
      const payload = await response.json();
      const body = String(payload?.choices?.[0]?.message?.content || '').trim();
      if (!body) {
        throw new Error('AI_EMPTY_REPLY');
      }
      return {
        body,
        provider: runtimeModel,
        safetyNote: '大模型只生成回复草稿，发送前需要人工确认。'
      };
    }
  };
}
