export function formatInferenceTimestamp(iso: string | null): string {
  if (iso === null || iso === '') {
    return '—';
  }
  const d: Date = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function parseIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  return value;
}

export function isProbablyMissingCreatedAtColumn(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes('created_at') && m.includes('column')) ||
    m.includes('does not exist') ||
    m.includes('schema cache')
  );
}
