export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = then - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diffMin);
  if (abs < 60) return rtf.format(diffMin, 'minute');
  if (abs < 60 * 24) return rtf.format(Math.round(diffMin / 60), 'hour');
  return rtf.format(Math.round(diffMin / (60 * 24)), 'day');
}

/** Masks all but the last 4 characters of a secret, e.g. `gw_live_9f2c…3ab1`. */
export function maskSecret(secret: string, visible = 4): string {
  if (secret.length <= visible) return secret;
  const prefix = secret.slice(0, secret.indexOf('_', secret.indexOf('_') + 1) + 1) || '';
  const tail = secret.slice(-visible);
  return `${prefix}${'•'.repeat(Math.max(secret.length - prefix.length - visible, 4))}${tail}`;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}
