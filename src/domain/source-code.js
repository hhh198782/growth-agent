import { createHash } from 'node:crypto';

export function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return slug || 'target';
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function shortHash(value) {
  return createHash('sha1').update(String(value)).digest('hex').slice(0, 6);
}

export function makeSourceCode({ channel, toolId, targetLabel, now = new Date() }) {
  const safeChannel = slugify(channel).replaceAll('-', '_');
  const safeTool = slugify(toolId).replaceAll('-', '_');
  const safeTarget = slugify(targetLabel).replaceAll('-', '_');
  return `${safeChannel}_${safeTool}_${safeTarget}_${formatDate(now)}_${shortHash(`${channel}:${toolId}:${targetLabel}`)}`;
}

export function buildMiniappPath(path, params) {
  const rawPath = String(path || '/pages/index/index');
  const [base, query = ''] = rawPath.split('?');
  const search = new URLSearchParams(query);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });

  const suffix = search.toString();
  return suffix ? `${base}?${suffix}` : base;
}

