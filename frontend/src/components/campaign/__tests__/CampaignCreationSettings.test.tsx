/**
 * The creation settings of a campaign, as the settings panel shows them: the
 * ways players may set ability scores (at least one stays on) and how closely
 * guided creation holds to the rules.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CampaignCreationSettings from '../CampaignCreationSettings';

const props = { methods: ['POINT_BUY', 'STANDARD_ARRAY'] as const, detailLevel: 'FAITHFUL' as const };

it('shows the methods and the detail level the campaign has', () => {
  render(<CampaignCreationSettings {...props} methods={[...props.methods]} onChange={vi.fn()} />);
  expect(screen.getByRole('checkbox', { name: 'Point buy' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Standard array' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Roll 4d6' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: /Faithful/ })).toBeChecked();
  expect(screen.getByRole('radio', { name: /Flexible/ })).not.toBeChecked();
});

it('sends the new list of methods when one is ticked', async () => {
  const onChange = vi.fn();
  render(<CampaignCreationSettings {...props} methods={[...props.methods]} onChange={onChange} />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Roll 4d6' }));
  expect(onChange).toHaveBeenCalledWith({ abilityScoreMethods: ['POINT_BUY', 'STANDARD_ARRAY', 'ROLL'] });
});

it('refuses to untick the last method', async () => {
  const onChange = vi.fn();
  render(<CampaignCreationSettings methods={['ROLL']} detailLevel="FLEXIBLE" onChange={onChange} />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Roll 4d6' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox', { name: 'Roll 4d6' })).toBeChecked();
});

it('sends the detail level when the other one is picked', async () => {
  const onChange = vi.fn();
  render(<CampaignCreationSettings {...props} methods={[...props.methods]} onChange={onChange} />);
  await userEvent.click(screen.getByRole('radio', { name: /Flexible/ }));
  expect(onChange).toHaveBeenCalledWith({ detailLevel: 'FLEXIBLE' });
});

it('disables every control when disabled', () => {
  render(<CampaignCreationSettings {...props} methods={[...props.methods]} onChange={vi.fn()} disabled />);
  for (const control of [...screen.getAllByRole('checkbox'), ...screen.getAllByRole('radio')]) {
    expect(control).toBeDisabled();
  }
});
