import { formatUnits } from 'viem';

/** Human-friendly token amount: full precision trimmed, thousands grouped. */
export function fmtAmount(raw: bigint | string | null | undefined, decimals: number, maxFrac = 6): string {
  if (raw === null || raw === undefined) return '—';
  const value = typeof raw === 'string' ? BigInt(raw) : raw;
  const s = formatUnits(value, decimals);
  const [int, frac = ''] = s.split('.');
  const grouped = Number(int).toLocaleString('en-US');
  const trimmed = frac.slice(0, maxFrac).replace(/0+$/, '');
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
