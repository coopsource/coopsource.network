const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function localDateTimeToIso(
  value: string,
  timezoneOffsetMinutes?: number,
): string {
  const match = localDateTimePattern.exec(value);
  if (!match) return '';

  const [, year, month, day, hour, minute] = match;
  const parts = [
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
  ] as const;
  const localDate = new Date(
    parts[0],
    parts[1] - 1,
    parts[2],
    parts[3],
    parts[4],
  );
  if (
    localDate.getFullYear() !== parts[0] ||
    localDate.getMonth() !== parts[1] - 1 ||
    localDate.getDate() !== parts[2] ||
    localDate.getHours() !== parts[3] ||
    localDate.getMinutes() !== parts[4]
  ) {
    return '';
  }

  if (timezoneOffsetMinutes === undefined) {
    return localDate.toISOString();
  }

  return new Date(
    Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]) +
      timezoneOffsetMinutes * 60_000,
  ).toISOString();
}

export function isoDateTimeToLocalInput(
  value: string,
  timezoneOffsetMinutes?: number,
): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return '';

  const offset = timezoneOffsetMinutes ?? instant.getTimezoneOffset();
  return new Date(instant.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16);
}
