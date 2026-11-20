/**
 * The Lights panel's "Dark" switch and its warning.
 *
 * "Dark" (Escuro) is the map's Global Illumination turned the other way:
 * on, only lights and darkvision show the map; off, everything in line of
 * sight is lit. With lighting on, the map dark and no lights placed, players
 * see only their darkvision, which for most tokens is nothing. The panel
 * says so, because a GM who has just made the map dark needs to know why it
 * went dark for the table.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ts from 'typescript';
import GmLightControls from '../GmLightControls';

function renderPanel(over: Partial<{ lightCount: number; lightingEnabled: boolean; globalIllumination: boolean }> = {}, unfold = true) {
  const onGlobalIlluminationChange = vi.fn();
  render(
    <GmLightControls
      lightMode={null}
      onLightModeChange={vi.fn()}
      lightCount={0}
      onClearAll={vi.fn()}
      lightingEnabled
      globalIllumination={false}
      onGlobalIlluminationChange={onGlobalIlluminationChange}
      {...over}
    />
  );
  if (unfold) fireEvent.click(screen.getByText(/^Lights/)); // the panel starts folded
  return { onGlobalIlluminationChange };
}

const WARNING = /No lights placed and the map is dark/;
const darkSwitch = () => screen.getByRole('switch', { name: 'Dark' });

describe('GmLightControls', () => {
  it('warns when lighting is on, the map is dark and there are no lights', () => {
    renderPanel();
    expect(screen.getByText(WARNING)).toBeTruthy();
  });

  it('does not warn once a light is placed', () => {
    renderPanel({ lightCount: 1 });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('does not warn under Global Illumination', () => {
    renderPanel({ globalIllumination: true });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('does not warn while dynamic lighting is off, and disables the switch', () => {
    renderPanel({ lightingEnabled: false });
    expect(screen.queryByText(WARNING)).toBeNull();
    expect(darkSwitch()).toBeDisabled();
  });

  it('shows the Dark switch on, when Global Illumination is off', () => {
    renderPanel({ globalIllumination: false });
    expect(darkSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the Dark switch off, when Global Illumination is on', () => {
    renderPanel({ globalIllumination: true });
    expect(darkSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('turning Dark on sends Global Illumination off', () => {
    const { onGlobalIlluminationChange } = renderPanel({ globalIllumination: true });
    fireEvent.click(darkSwitch());
    expect(onGlobalIlluminationChange).toHaveBeenCalledWith(false);
  });

  it('turning Dark off sends Global Illumination on', () => {
    const { onGlobalIlluminationChange } = renderPanel({ globalIllumination: false });
    fireEvent.click(darkSwitch());
    expect(onGlobalIlluminationChange).toHaveBeenCalledWith(true);
  });

  // Easy to find: a GM need not unfold the panel to make the map dark.
  it('shows the Dark switch with the panel folded', () => {
    renderPanel({ globalIllumination: true }, false);
    expect(darkSwitch()).toBeTruthy();
  });

  it('shows no switch when nothing listens for it', () => {
    render(<GmLightControls lightMode={null} onLightModeChange={vi.fn()} lightCount={0} onClearAll={vi.fn()} lightingEnabled />);
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

// The colour box refused every value but a complete colour, so each key
// typed into it was undone at once and nothing could be typed there.
describe('the light colour box', () => {
  function renderColour() {
    const onDefaultsChange = vi.fn();
    render(
      <GmLightControls
        lightMode="light-place"
        onLightModeChange={vi.fn()}
        lightCount={0}
        onClearAll={vi.fn()}
        onDefaultsChange={onDefaultsChange}
        placementDefaults={{ brightRadius: 4, dimRadius: 8, color: '#ffcc66' }}
      />
    );
    fireEvent.click(screen.getByText(/^Lights/));
    return { onDefaultsChange, box: screen.getByPlaceholderText('#ffcc66') as HTMLInputElement };
  }

  it('takes a colour typed one key at a time', async () => {
    const { onDefaultsChange, box } = renderColour();
    await userEvent.clear(box);
    await userEvent.type(box, '#FF9933');
    expect(box.value).toBe('#FF9933');
    expect(onDefaultsChange).toHaveBeenLastCalledWith({ brightRadius: 4, dimRadius: 8, color: '#ff9933' });
  });

  it('takes a colour typed without the #', async () => {
    const { onDefaultsChange, box } = renderColour();
    await userEvent.clear(box);
    await userEvent.type(box, '66aaff');
    expect(onDefaultsChange).toHaveBeenLastCalledWith({ brightRadius: 4, dimRadius: 8, color: '#66aaff' });
  });

  it('goes back to the colour in use when left unfinished', async () => {
    const { onDefaultsChange, box } = renderColour();
    await userEvent.clear(box);
    await userEvent.type(box, '#ff9');
    expect(box.value).toBe('#ff9');
    fireEvent.blur(box);
    expect(box.value).toBe('#ffcc66');
    expect(onDefaultsChange).not.toHaveBeenCalled();
  });
});

// The title that folds the panel was a clickable box, out of reach of Tab and
// silent about whether the panel was open.
describe('the Lights title', () => {
  it('is a button that says whether the panel is open, and folds it', () => {
    render(<GmLightControls lightMode={null} onLightModeChange={vi.fn()} lightCount={2} onClearAll={vi.fn()} lightingEnabled />);
    // A space between the word and the count, which read as "Lights(2)".
    const title = screen.getByRole('button', { name: 'Lights (2)' });
    expect(title).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(title);

    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(title.getAttribute('aria-controls') ?? '')).not.toBeNull();
  });
});

// The setting is written one way wherever a user reads or hears its name: the
// Lights panel, Edit Map and the message when a change fails. Only what a
// page may show or speak is read, a JSX text or a string's or a template's
// text, such as a label, an aria-label, a title or a message; comments and
// code are left alone.
describe('the name Global Illumination', () => {
  const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/__tests__/**', '!/src/**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true });

  /** The text in a source a page may show or speak: JSX text, and string and template text. */
  function shownText(file: string, source: string): string[] {
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) found.push(node.text);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
  }

  it('reads what a page shows, and not comments or names', () => {
    const sample = [
      '// skipped under global illumination',
      'const globalIllumination = true;',
      'export const Switch = () => <label title="Lit" aria-label="Global illumination">Global illumination</label>;',
      "export const message = `Could not change ${'x'} global illumination`;",
    ].join('\n');
    expect(shownText('/sample.tsx', sample)).toEqual(['Lit', 'Global illumination', 'Global illumination', 'Could not change ', 'x', ' global illumination']);
  });

  it('is spelled Global Illumination wherever a page shows it', () => {
    expect(Object.keys(sources)).toContain('/src/components/campaign/GmLightControls.tsx');
    // Only a source with the word in it can show it: the rest are not parsed.
    const naming = Object.entries(sources).filter(([, source]) => /illumination/i.test(source));
    expect(naming.map(([file]) => file)).toContain('/src/components/campaign/GmLightControls.tsx');
    const others = naming.flatMap(([file, source]) =>
      shownText(file, source).flatMap((text) =>
        [...text.matchAll(/global illumination/gi)].filter((m) => m[0] !== 'Global Illumination').map((m) => `${file}: ${m[0]}`)));
    expect(others).toEqual([]);
  });
});
