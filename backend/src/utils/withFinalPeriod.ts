/** The text with a closing period, unless it already ends in one. */
export function withFinalPeriod(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}
