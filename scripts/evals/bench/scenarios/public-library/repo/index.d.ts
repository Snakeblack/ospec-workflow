/** Parses a compact duration such as "1h30m" or "2m 5s" into milliseconds. */
export function parse(text: string): number;

/** Formats milliseconds as "1h 30m". */
export function format(ms: number): string;
