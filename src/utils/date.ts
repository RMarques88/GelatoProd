type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const RELATIVE_UNITS: Array<{
  limit: number;
  divisor: number;
  label: RelativeUnit;
}> = [
  { limit: 60, divisor: 1, label: 'second' },
  { limit: 3600, divisor: 60, label: 'minute' },
  { limit: 86400, divisor: 3600, label: 'hour' },
  { limit: 604800, divisor: 86400, label: 'day' },
  { limit: 2629800, divisor: 604800, label: 'week' },
  { limit: 31557600, divisor: 2629800, label: 'month' },
];

const FALLBACK_LABELS: Record<RelativeUnit, { singular: string; plural: string }> = {
  second: { singular: 'segundo', plural: 'segundos' },
  minute: { singular: 'minuto', plural: 'minutos' },
  hour: { singular: 'hora', plural: 'horas' },
  day: { singular: 'dia', plural: 'dias' },
  week: { singular: 'semana', plural: 'semanas' },
  month: { singular: 'mês', plural: 'meses' },
  year: { singular: 'ano', plural: 'anos' },
};

const relativeFormatter =
  typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function'
    ? new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
    : null;

function formatWithFallback(value: number, unit: RelativeUnit) {
  const absValue = Math.abs(value);

  if (absValue === 0) {
    return 'agora';
  }

  const { singular, plural } = FALLBACK_LABELS[unit];
  const unitLabel = absValue === 1 ? singular : plural;
  const prefix = value < 0 ? 'há' : 'em';

  return `${prefix} ${absValue} ${unitLabel}`;
}

export function formatRelativeDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.round(diffMs / 1000);

  for (const unit of RELATIVE_UNITS) {
    if (Math.abs(diffSeconds) < unit.limit) {
      const valueToFormat = -Math.round(diffSeconds / unit.divisor);
      return relativeFormatter
        ? relativeFormatter.format(
            valueToFormat,
            unit.label as Intl.RelativeTimeFormatUnit,
          )
        : formatWithFallback(valueToFormat, unit.label);
    }
  }

  const years = -Math.round(diffSeconds / 31557600);
  return relativeFormatter
    ? relativeFormatter.format(years, 'year')
    : formatWithFallback(years, 'year');
}
