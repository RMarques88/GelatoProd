export function formatRelativeDate(value: Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.round(diffMs / 1000);

  const units: Array<{ limit: number; divisor: number; label: Intl.RelativeTimeFormatUnit }> = [
    { limit: 60, divisor: 1, label: 'second' },
    { limit: 3600, divisor: 60, label: 'minute' },
    { limit: 86400, divisor: 3600, label: 'hour' },
    { limit: 604800, divisor: 86400, label: 'day' },
    { limit: 2629800, divisor: 604800, label: 'week' },
    { limit: 31557600, divisor: 2629800, label: 'month' },
  ];

  const formatter = new Intl.RelativeTimeFormat('pt-BR', {
    numeric: 'auto',
  });

  for (const unit of units) {
    if (Math.abs(diffSeconds) < unit.limit) {
      const valueToFormat = Math.round(diffSeconds / unit.divisor);
      return formatter.format(-valueToFormat, unit.label);
    }
  }

  const years = Math.round(diffSeconds / 31557600);
  return formatter.format(-years, 'year');
}
