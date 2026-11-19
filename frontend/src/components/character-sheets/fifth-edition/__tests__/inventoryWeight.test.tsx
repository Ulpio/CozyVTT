/**
 * A Flexible campaign does not track weight (ledger: detail level). The
 * inventory leaves it out there, and the 5e sheet leaves it out for a
 * character of a Flexible campaign; the weights stay on the sheet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Character } from '@/types';
import { InventoryList } from '../components/InventoryList';
import { FifthEditionCharacterView } from '../FifthEditionCharacterView';
import { fifthEditionCharacter } from './fifthEditionFixture';

// The campaign the sheet is shown in, if any (the Characters page has none).
let campaignInView: { id: string; detailLevel: string } | undefined;
vi.mock('@/contexts/CampaignContext', () => ({
  useOptionalCampaign: () => (campaignInView ? { campaign: campaignInView } : undefined),
}));
beforeEach(() => {
  campaignInView = undefined;
});

const ITEMS = [{ name: 'Rope', quantity: 1, weight: 10 }];

describe('inventory weight', () => {
  it('is shown by default', () => {
    render(<InventoryList inventory={ITEMS} strengthScore={10} />);
    expect(screen.getByText(/Total Weight/)).toBeInTheDocument();
    expect(screen.getByText('Wt')).toBeInTheDocument();
    expect(screen.getByText(/Carrying capacity/)).toBeInTheDocument();
  });

  it('is left out with showWeight off', () => {
    render(<InventoryList inventory={ITEMS} strengthScore={10} showWeight={false} />);
    expect(screen.getByText('Rope')).toBeInTheDocument();
    expect(screen.queryByText(/Total Weight/)).not.toBeInTheDocument();
    expect(screen.queryByText('Wt')).not.toBeInTheDocument();
    expect(screen.queryByText(/lb/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Carrying capacity/)).not.toBeInTheDocument();
  });

  it.each([
    ['FLEXIBLE', false],
    ['FAITHFUL', true],
  ] as const)('the 5e sheet of a %s campaign shows weight: %s', (detailLevel, shown) => {
    const character: Character = fifthEditionCharacter();
    render(<FifthEditionCharacterView character={character} campaignDetailLevel={detailLevel} />);
    fireEvent.click(screen.getByRole('tab', { name: /Inventory/ }));
    expect(screen.queryAllByText(/^Load:/).length > 0).toBe(shown);
  });

  it.each([
    ['camp-1', false],
    ['camp-2', true],
  ])('inside a Flexible campaign, a character of %s shows weight: %s', (campaignId, shown) => {
    campaignInView = { id: 'camp-1', detailLevel: 'FLEXIBLE' };
    render(<FifthEditionCharacterView character={{ ...fifthEditionCharacter(), campaignId }} />);
    fireEvent.click(screen.getByRole('tab', { name: /Inventory/ }));
    expect(screen.queryAllByText(/^Load:/).length > 0).toBe(shown);
  });
});
