// ============================================
// How characters are made in a campaign: the ways players may set ability
// scores, and how closely guided creation holds to the rules as written.
// The settings panel shows it; the caller saves the change.
// ============================================

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { AbilityScoreMethod, CampaignDetailLevel } from '@/types';

interface CampaignCreationSettingsProps {
  methods: AbilityScoreMethod[];
  detailLevel: CampaignDetailLevel;
  onChange: (patch: Partial<{ abilityScoreMethods: AbilityScoreMethod[]; detailLevel: CampaignDetailLevel }>) => void;
  disabled?: boolean;
}

/** The methods in the order they are offered and stored. */
const METHODS: AbilityScoreMethod[] = ['POINT_BUY', 'STANDARD_ARRAY', 'ROLL'];
const LEVELS: CampaignDetailLevel[] = ['FAITHFUL', 'FLEXIBLE'];

export default function CampaignCreationSettings({ methods, detailLevel, onChange, disabled }: CampaignCreationSettingsProps) {
  const { t } = useTranslation();
  const levelGroup = useId();

  const toggle = (method: AbilityScoreMethod, on: boolean) => {
    const next = METHODS.filter((m) => (m === method ? on : methods.includes(m)));
    // At least one way to set scores must stay on.
    if (next.length === 0) return;
    onChange({ abilityScoreMethods: next });
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-semibold text-stone-gray">{t('campaignCreation.methodsLegend')}</legend>
        <p className="text-xs text-warm-gray">{t('campaignCreation.methodsHint')}</p>
        <ul className="space-y-1">
          {METHODS.map((method) => (
            <li key={method}>
              <label className="flex items-center gap-2 text-sm text-ink touch-target">
                <input
                  type="checkbox"
                  checked={methods.includes(method)}
                  onChange={(e) => toggle(method, e.target.checked)}
                  className="h-4 w-4 accent-moss-green"
                />
                {t(`campaignCreation.method.${method}`)}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-semibold text-stone-gray">{t('campaignCreation.levelLegend')}</legend>
        <ul className="space-y-1">
          {LEVELS.map((level) => (
            <li key={level}>
              <label className="flex items-start gap-2 text-sm text-ink touch-target">
                <input
                  type="radio"
                  name={levelGroup}
                  checked={detailLevel === level}
                  onChange={() => onChange({ detailLevel: level })}
                  className="mt-0.5 h-4 w-4 accent-moss-green"
                />
                <span>
                  {t(`campaignCreation.level.${level}`)}
                  <span className="block text-xs text-warm-gray">{t(`campaignCreation.levelHint.${level}`)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
