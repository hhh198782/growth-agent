function sameUtcDay(a, b) {
  const left = new Date(a).toISOString().slice(0, 10);
  const right = new Date(b).toISOString().slice(0, 10);
  return left === right;
}

export function canCreateDraft({ target, campaignId, existingDrafts = [], dailyLimit = 20, now = new Date() }) {
  if (!target?.allowed) {
    return { allowed: false, reason: 'target_not_allowed' };
  }

  const todaysCampaignDrafts = existingDrafts.filter((draft) => (
    draft.campaignId === campaignId && sameUtcDay(draft.createdAt, now)
  ));

  const duplicate = todaysCampaignDrafts.some((draft) => draft.targetId === target.id);
  if (duplicate) {
    return { allowed: false, reason: 'duplicate_target_today' };
  }

  if (todaysCampaignDrafts.length >= Number(dailyLimit || 0)) {
    return { allowed: false, reason: 'daily_limit_reached' };
  }

  return { allowed: true, reason: 'allowed' };
}

