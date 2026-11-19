/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets are JSON read loosely */
/** The weapons a fixture sheet lists are held: the bar lists what is in hand. */
export function holdWeapons(s: any): any {
  for (const a of s.attacks ?? []) {
    const item = (s.inventory ?? []).find((i: any) => i.name.trim().toLowerCase() === String(a.name).trim().toLowerCase());
    if (item) {
      item.slot = 'main';
      item.equipped = true;
    }
  }
  return s;
}
