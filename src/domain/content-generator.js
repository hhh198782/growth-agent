import { buildMiniappPath } from './source-code.js';

function channelFromTarget(target) {
  if (target?.kind === 'friend') return 'wechat_friend';
  if (target?.kind === 'moments') return 'wechat_moments';
  return 'wechat_group';
}

export function generateDraft({ campaign, target, sourceCode }) {
  const channel = channelFromTarget(target);
  const sourcePath = buildMiniappPath(campaign.miniappPath, { source: sourceCode });
  const targetHint = target?.kind === 'moments' ? '朋友圈' : `「${target.label}」`;

  const body = [
    `给${targetHint}的草稿：`,
    '',
    `我做了一个微信里直接用的「${campaign.toolName}」小工具。`,
    campaign.goal ? `适合：${campaign.goal}` : '适合临时处理常见小任务，不用额外下载 App。',
    '',
    `小程序路径：${sourcePath}`,
    `来源码：${sourceCode}`,
    '',
    '发送前检查：只发给白名单目标；确认内容合适后再手动确认后再发送。'
  ].join('\n');

  return {
    channel,
    sourcePath,
    body
  };
}

