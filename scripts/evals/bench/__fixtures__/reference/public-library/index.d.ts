/** Parses a compact duration such as "2d4h", "1h30m" or "2m 5s" into milliseconds. */
export function parse(text: string): number;

export interface FormatOptions {
  /** Show whole days ("1d 2h") instead of hours beyond 24. Defaults to false. */
  days?: boolean;
}

/** Formats milliseconds as "1h 30m" (or "1d 1h" with `{ days: true }`). */
export function format(ms: number, options?: FormatOptions): string;
