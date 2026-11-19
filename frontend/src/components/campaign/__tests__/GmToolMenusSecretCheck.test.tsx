/** The Table menu's first entry is the secret check, and it opens that tool. */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { characterMenuRows, openCharacterMenu } from '@/test/characterMenuRows';
import GmToolMenus from '../GmToolMenus';

describe('the GM Table menu', () => {
  it('lists Secret check first and opens the secretCheck tool', () => {
    const onOpen = vi.fn();
    render(<GmToolMenus openPanels={{}} onOpen={onOpen} onOpenDocuments={() => undefined} onOpenShortcuts={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Table/ }));
    expect(characterMenuRows()[0]).toBe('[eye-off] Secret check');
    fireEvent.click(openCharacterMenu()!.children[0]);
    expect(onOpen).toHaveBeenCalledWith('secretCheck');
  });
});
