/**
 * New Character Modal
 * Modal dialog for creating a new character with game system templates
 */

import { useState, FormEvent, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { Loader2, User, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui';
import { Character, GameSystem, Campaign } from '@/types';
import { GAME_SYSTEM_OPTIONS, gameSystemName, playedGameSystem } from '@/constants/game-systems';
import { SHEET_NAME_MAX } from '@/constants/sheetLimits';
import api from '@/services/api';
import Button from '@/components/ui/Button';
import { apiErrorMessage, apiValidationIssues, errorMessage, errorSummary } from '@/utils/errors';
import GuidedCreationModal from './guided/GuidedCreationModal';

/** Set when the character was made and publishing it as a template was not. */
export interface TemplatePublishFailure {
  templateFailed: true;
  /** The server's reason, when it gave one. */
  reason?: string;
}

interface NewCharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * The character was created. The second argument is set when Create &
   * Publish as Template made the character and failed to publish it, so the
   * page can say so once this dialog has closed.
   */
  onSuccess: (character: Character, templateFailure?: TemplatePublishFailure) => void;
  /** If provided, character will be assigned to this campaign */
  campaign?: Campaign;
  /** If provided, this game system will be pre-selected and locked */
  preselectedGameSystem?: GameSystem | null;
}

interface TemplateOption {
  value: string;
  labelKey: ParseKeys;
  descriptionKey: ParseKeys;
}

/** The 5e option that opens the guided creation instead of making a sheet. */
const GUIDED_TEMPLATE = 'guided';

const TEMPLATE_OPTIONS_BY_SYSTEM: Record<string, TemplateOption[]> = {
  [GameSystem.FIFTH_EDITION]: [
    {
      value: 'blank',
      labelKey: 'newCharacter.templates.blank',
      descriptionKey: 'newCharacter.templates.blankL1',
    },
    {
      value: 'fighter',
      labelKey: 'newCharacter.templates.fighter',
      descriptionKey: 'newCharacter.templates.fighter5e',
    },
    {
      value: GUIDED_TEMPLATE,
      labelKey: 'guidedCreation.entry.label',
      descriptionKey: 'guidedCreation.entry.description',
    },
  ],
  [GameSystem.FANTASY_D20]: [
    {
      value: 'blank',
      labelKey: 'newCharacter.templates.blank',
      descriptionKey: 'newCharacter.templates.blankL1',
    },
    {
      value: 'fighter',
      labelKey: 'newCharacter.templates.fighter',
      descriptionKey: 'newCharacter.templates.fighterD20',
    },
  ],
  [GameSystem.HORROR_D100]: [
    {
      value: 'blank',
      labelKey: 'newCharacter.templates.blank',
      descriptionKey: 'newCharacter.templates.blankHorror',
    },
    {
      value: 'privateinvestigator',
      labelKey: 'newCharacter.templates.detective',
      descriptionKey: 'newCharacter.templates.detectiveDesc',
    },
  ],
};

export default function NewCharacterModal({
  isOpen,
  onClose,
  onSuccess,
  campaign,
  preselectedGameSystem,
}: NewCharacterModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    campaign?.id || null
  );
  const [gameSystem, setGameSystem] = useState<GameSystem | null>(
    preselectedGameSystem || playedGameSystem(campaign?.gameSystem)
  );
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');
  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [error, setError] = useState('');
  const [guidedOpen, setGuidedOpen] = useState(false);
  const isGuided = gameSystem === GameSystem.FIFTH_EDITION && selectedTemplate === GUIDED_TEMPLATE;
  // The wizard reads the campaign's books, methods and detail level.
  const guidedCampaign = campaign ?? availableCampaigns.find((c) => c.id === selectedCampaignId);

  // Fetch user's campaigns when modal opens
  useEffect(() => {
    if (isOpen && !campaign) {
      fetchUserCampaigns();
    }
  }, [isOpen, campaign]);

  // The game system follows the chosen campaign's, Flexible for a campaign
  // with none: a 5E campaign and then a Flexible one left 5E chosen, with
  // nothing locking it. A new system starts from its blank sheet. A campaign
  // of a system CozyVTT no longer supports is one with none.
  const chooseCampaign = (campaignId: string | null) => {
    setSelectedCampaignId(campaignId);
    const chosen = availableCampaigns.find((c) => c.id === campaignId);
    if (!chosen) return;
    const system = playedGameSystem(chosen.gameSystem);
    if (system !== gameSystem) {
      setGameSystem(system);
      setSelectedTemplate('blank');
    }
  };

  const fetchUserCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const response = await api.listCampaigns();
      setAvailableCampaigns(response.campaigns);
    } catch (err) {
      console.error('Failed to fetch campaigns:', errorSummary(err));
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const isGameSystemLocked = (): boolean => {
    // If preselected (from campaign context), lock it
    if (preselectedGameSystem !== undefined) {
      return true;
    }

    // A chosen campaign decides the system, Flexible for a campaign with none:
    // the server takes only a character of the campaign's own system.
    if (selectedCampaignId && availableCampaigns.length > 0) {
      return availableCampaigns.some((c) => c.id === selectedCampaignId);
    }

    return false;
  };

  const getTemplateOptions = (): TemplateOption[] => {
    if (!gameSystem) {
      return [
        {
          value: 'blank',
          labelKey: 'newCharacter.templates.flexBlank',
          descriptionKey: 'newCharacter.templates.flexBlankDesc',
        },
        {
          value: 'basic',
          labelKey: 'newCharacter.templates.basic',
          descriptionKey: 'newCharacter.templates.basicDesc',
        },
      ];
    }

    return TEMPLATE_OPTIONS_BY_SYSTEM[gameSystem] || [];
  };

  /**
   * When true, the sheet is also published as a shared template after the
   * character is created. Held in a ref rather than state because the second
   * submit button sets it immediately before the form submits, and a state
   * update would not have landed by the time handleSubmit reads it.
   */
  const alsoPublishTemplate = useRef(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    // Read once and cleared for every way this submit ends, so a create that
    // fails or is stopped here does not publish on the next plain Create.
    const publishTemplate = alsoPublishTemplate.current;
    alsoPublishTemplate.current = false;

    // The wizard asks for the name and creates the character itself.
    if (isGuided) {
      setGuidedOpen(true);
      return;
    }

    // Validation
    if (name.trim().length < 2) {
      setError(t('newCharacter.nameTooShort'));
      return;
    }

    // The server and the sheet editors take names up to SHEET_NAME_MAX.
    if (name.trim().length > SHEET_NAME_MAX) {
      setError(t('newCharacter.nameTooLong', { max: SHEET_NAME_MAX }));
      return;
    }

    setLoading(true);

    try {
      // Always fetch the template from the backend (even for 'blank') so that
      // the character is created with all required schema fields populated.
      let templateData: Record<string, unknown> = {};
      if (selectedTemplate) {
        const systemParam = gameSystem || 'null';
        const starter = await api.getStarterSheet(systemParam, selectedTemplate);
        templateData = starter.data || {};
      }

      // Create character using the api client
      const response = await api.createCharacter({
        name: name.trim(),
        campaignId: selectedCampaignId || undefined,
        gameSystem: gameSystem || undefined,
        data: templateData as unknown as import('@/types').CharacterData,
      });

      // Optionally publish the character's sheet as a shared template: the
      // sheet as the server stored it, with the name and anything else it
      // filled in, and not the starter sheet sent. Done after the character
      // exists, and failing softly: the character is the thing the user asked
      // for, so a template error must not lose it. The dialog closes either
      // way, so the failure goes to the page to say.
      let templateFailure: TemplatePublishFailure | undefined;
      if (publishTemplate) {
        try {
          await api.createCharacterTemplate({
            name: name.trim(),
            gameSystem: response.character.gameSystem ?? null,
            data: response.character.data,
          });
        } catch (templateErr) {
          const reason = apiErrorMessage(templateErr);
          templateFailure = reason ? { templateFailed: true, reason } : { templateFailed: true };
        }
      }

      // Reset form
      setName('');
      setSelectedCampaignId(campaign?.id || null);
      setGameSystem(preselectedGameSystem || playedGameSystem(campaign?.gameSystem));
      setSelectedTemplate('blank');

      // Notify parent
      if (templateFailure) {
        onSuccess(response.character, templateFailure);
      } else {
        onSuccess(response.character);
      }

      // Close modal
      onClose();
    } catch (err) {
      // Show detailed validation errors if available
      const issues = apiValidationIssues(err);
      if (issues) {
        const errorList = issues
          .map((e) => `• ${e.path}: ${e.message}`)
          .join('\n');
        setError(`${apiErrorMessage(err)}\n\n${errorList}`);
        console.error('Validation errors:', issues);
      } else {
        setError(apiErrorMessage(err) || errorMessage(err) || t('newCharacter.createFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setSelectedCampaignId(campaign?.id || null);
    setGameSystem(preselectedGameSystem || playedGameSystem(campaign?.gameSystem));
    setSelectedTemplate('blank');
    setError('');
    setGuidedOpen(false);
  };

  const handleClose = () => {
    if (!loading) {
      resetForm();
      onClose();
    }
  };

  // The wizard made the character: it is this dialog's, and both close.
  const handleGuidedCreated = (character: Character) => {
    resetForm();
    onSuccess(character);
    onClose();
  };

  const isFormValid = isGuided || name.trim().length >= 2;

  return (
    <>
    <GuidedCreationModal
      isOpen={isOpen && guidedOpen}
      onClose={() => setGuidedOpen(false)}
      onCreated={handleGuidedCreated}
      campaign={guidedCampaign}
    />
    <Modal open={isOpen && !guidedOpen} onClose={handleClose} title={t('newCharacter.title')} icon={User} size="lg" closeDisabled={loading}>
      {/* Error Alert */}
      {error && (
                <div className="mb-4 bg-spirit-red/10 border border-spirit-red/30 rounded-lg p-4 max-h-60 overflow-y-auto">
                  <p className="text-sm text-danger-ink font-medium whitespace-pre-wrap font-mono">
                    {error}
                  </p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Character Name (the wizard asks for it in the guided creation) */}
                {!isGuided && (
                  <div>
                    <label
                      htmlFor="characterName"
                      className="block text-sm font-semibold text-ink mb-2"
                    >
                      {t('newCharacter.name')} <span className="text-danger-ink">*</span>
                    </label>
                    <input
                      type="text"
                      id="characterName"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('newCharacter.namePlaceholder')}
                      disabled={loading}
                      maxLength={SHEET_NAME_MAX}
                      className="input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed"
                      data-autofocus
                      required
                    />
                    <p className="mt-1 text-xs text-ink-muted">
                      {t('newCharacter.nameHint', { max: SHEET_NAME_MAX })}
                    </p>
                  </div>
                )}

                {/* Campaign Selection (if not from campaign context) */}
                {!campaign && (
                  <div>
                    <label
                      htmlFor="campaign"
                      className="block text-sm font-semibold text-ink mb-2"
                    >
                      {t('newCharacter.campaign')} <span className="text-ink-muted">{t('newCharacter.optional')}</span>
                    </label>
                    <select
                      id="campaign"
                      value={selectedCampaignId || ''}
                      onChange={(e) => chooseCampaign(e.target.value || null)}
                      disabled={loading || loadingCampaigns}
                      className="input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">{t('newCharacter.unassigned')}</option>
                      {availableCampaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.gameSystem && ` (${gameSystemName(c.gameSystem)})`}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-ink-muted">
                      {t('newCharacter.campaignHint')}
                    </p>
                  </div>
                )}

                {/* Game System Selection */}
                <div>
                  <label
                    htmlFor="gameSystem"
                    className="block text-sm font-semibold text-ink mb-2"
                  >
                    {t('newCharacter.gameSystem')}{' '}
                    {isGameSystemLocked() ? (
                      <span className="text-ink-muted">{t('newCharacter.fromCampaign')}</span>
                    ) : (
                      <span className="text-ink-muted">{t('newCharacter.optional')}</span>
                    )}
                  </label>
                  <select
                    id="gameSystem"
                    value={gameSystem || ''}
                    onChange={(e) => {
                      setGameSystem((e.target.value as GameSystem) || null);
                      setSelectedTemplate('blank'); // Reset template when game system changes
                    }}
                    disabled={loading || isGameSystemLocked()}
                    className="input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">{t('newCharacter.flexible')}</option>
                    {GAME_SYSTEM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-ink-muted">
                    {isGameSystemLocked()
                      ? t('newCharacter.systemInherited')
                      : t('newCharacter.systemHint')}
                  </p>
                </div>

                {/* Template Selection (only if game system is selected) */}
                {gameSystem && (
                  <div>
                    <label
                      htmlFor="template"
                      className="block text-sm font-semibold text-ink mb-2"
                    >
                      {t('newCharacter.template')}
                    </label>
                    <div className="space-y-3">
                      {getTemplateOptions().map((template) => (
                        <label
                          key={template.value}
                          className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            selectedTemplate === template.value
                              ? 'border-moss-green bg-moss-green/5'
                              : 'border-ink/10 hover:border-moss-green/50'
                          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="radio"
                            name="template"
                            value={template.value}
                            checked={selectedTemplate === template.value}
                            onChange={(e) => setSelectedTemplate(e.target.value)}
                            disabled={loading}
                            className="mt-1 mr-3"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink">
                                {t(template.labelKey)}
                              </span>
                              {template.value !== 'blank' && (
                                <Sparkles className="w-4 h-4 text-accent-ink" />
                              )}
                            </div>
                            <p className="text-sm text-ink-muted mt-1">
                              {t(template.descriptionKey)}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-ink-muted">
                      {t('newCharacter.templateHint')}
                    </p>
                  </div>
                )}

                {/* Info Box */}
                {!isGuided && (
                  <div className="rounded-lg p-4 bg-moss-green/10 border border-moss-green/30">
                    <p className="text-sm text-ink">
                      <strong className="text-brand-ink">{t('newCharacter.noteLabel')}</strong> {t('newCharacter.note')}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    variant="secondary" className="flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('common.cancel')}
                  </Button>

                  <Button
                    type="submit"
                    disabled={loading || !isFormValid}
                    className="flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                        {t('newCharacter.creating')}
                      </>
                    ) : (
                      <>
                        <User className="w-4 h-4 inline-block mr-2" />
                        {isGuided ? t('guidedCreation.entry.start') : t('newCharacter.create')}
                      </>
                    )}
                  </Button>
                </div>

                {/* Publish the same sheet for others to copy, in one step. */}
                {!isGuided && (
                  <div className="pt-1">
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={loading || !isFormValid}
                      onClick={() => { alsoPublishTemplate.current = true; }}
                      title={t('newCharacter.publishHint')}
                      className="w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('newCharacter.createAndPublish')}
                    </Button>
                  </div>
                )}
              </form>
    </Modal>
    </>
  );
}
