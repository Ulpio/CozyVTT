/**
 * SecretCheckPanel
 *
 * GM-only slide-over: one check rolled in secret for several characters at
 * once, each with its own sheet's bonus, with 5E's passive Perception on top
 * and a private notice ("Avisar…") to a result's player. The players hear
 * nothing of the roll: the server sends it to the GMs alone (`gm.secretCheck`).
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EyeOff } from 'lucide-react';
import SlideOver, { SlideOverClose, SlideOverTitle } from '@/components/ui/SlideOver';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { api } from '@/services/api';
import { applyRollMode, ROLL_MODES, systemSupportsAdvantage, type RollMode } from '@/utils/rollModes';
import { checkChoices, checkFor, passivePerception, type CheckKey } from '@/utils/secretCheck';
import type { RollOption } from '@/utils/characterRolls';
import type { Character, SecretCheckAck } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Sheet = { id: string; name: string; userId: string; gameSystem: string | null; data: unknown };
type Result = Extract<SecretCheckAck, { ok: true }>['results'][number];
/** One ticked character's row in the last roll: its check, or null when its sheet has none. */
type Row = { sheet: Sheet; option: RollOption | null; expression: string };

const keyOf = (key: CheckKey) => `${key.group}|${key.label}`;

/** The die that counted on a d20 roll: the higher of two for advantage, the lower for disadvantage. */
function keptD20(expression: string, dice: number[]): number | null {
  if (!/^[12]d20/i.test(expression) || dice.length === 0) return null;
  if (/kh1/i.test(expression)) return Math.max(...dice);
  if (/kl1/i.test(expression)) return Math.min(...dice);
  return dice[0];
}

export default function SecretCheckPanel({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const { campaign } = useCampaign();
  const { socket } = useWebSocket();

  const roster = useMemo(
    () => (campaign?.characters ?? []).map((c: Character) => ({ id: c.id, name: c.name, userId: c.userId, gameSystem: c.gameSystem as string | null })),
    [campaign?.characters]
  );
  const rosterKey = roster.map((c) => c.id).join(',');

  const [sheets, setSheets] = useState<Record<string, Sheet>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<string | null>(null);
  const [mode, setMode] = useState<RollMode>('normal');
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<{ rows: Row[]; results: Result[] } | null>(null);

  const [noticeFor, setNoticeFor] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState('');
  const [sending, setSending] = useState(false);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // The sheets are read each time the panel opens: a bonus changed since is a different roll.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setLoading(true);
    setFailed([]);
    void Promise.all(
      roster.map(async (c) => {
        try {
          const { character } = await api.getCharacter(c.id);
          return { ...c, data: character.data as unknown };
        } catch {
          return null;
        }
      })
    ).then((read) => {
      if (!alive) return;
      const next: Record<string, Sheet> = {};
      const bad: string[] = [];
      read.forEach((sheet, i) => (sheet ? (next[sheet.id] = sheet) : bad.push(roster[i].name)));
      setSheets(next);
      setFailed(bad);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads on opening and when the roster changes
  }, [isOpen, rosterKey]);

  const read = roster.map((c) => sheets[c.id]).filter((s): s is Sheet => !!s);
  const ticked = read.filter((s) => !unticked.has(s.id));
  const choices = useMemo(() => checkChoices(read), [read.map((s) => s.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps -- by the sheets read
  const current = choices.find((c) => keyOf(c) === chosen) ?? choices[0] ?? null;
  const showMode = ticked.some((s) => systemSupportsAdvantage(s.gameSystem));
  const memberRole = (userId: string) => campaign?.memberships?.find((m) => m.userId === userId)?.role;

  const passive = read
    .map((s) => ({ sheet: s, value: passivePerception(s.gameSystem, s.data) }))
    .filter((p): p is { sheet: Sheet; value: number } => p.value !== null);

  const doRoll = async () => {
    if (!current || !socket) return;
    const rows: Row[] = ticked.map((sheet) => {
      const option = checkFor(sheet.gameSystem, sheet.data, current);
      const applied = option?.supportsAdvantage ? applyRollMode(option.expression, option.purpose, mode, sheet.gameSystem) : option;
      return { sheet, option, expression: applied?.expression ?? '' };
    });
    const rolls = rows
      .filter((r) => r.option)
      .map((r) => ({ characterId: r.sheet.id, expression: r.expression, purpose: `Teste secreto: ${current.label}`, characterName: r.sheet.name }));
    if (rolls.length === 0) {
      setError(t('secretCheck.pickOne'));
      return;
    }
    setError(null);
    setRolling(true);
    setNoticeFor(null);
    setSentTo(null);
    const ack = await socket.secretCheck(rolls);
    setRolling(false);
    if (!ack.ok) {
      setError(ack.error);
      return;
    }
    setRun({ rows, results: ack.results });
  };

  const sendNotice = async (characterId: string) => {
    if (!socket) return;
    setSending(true);
    setNoticeError(null);
    const ack = await socket.sendNotice({ characterId, text: noticeText });
    setSending(false);
    if (!ack.ok) {
      setNoticeError(ack.error);
      return;
    }
    setNoticeFor(null);
    setNoticeText('');
    setSentTo(characterId);
  };

  const groups = (['skills', 'abilities', 'savingThrows'] as const).map((group) => ({ group, items: choices.filter((c) => c.group === group) })).filter((g) => g.items.length > 0);

  return (
    <SlideOver open={isOpen} onClose={onClose} className="max-w-md bg-soft-cream border-l border-moss-green/20 shadow-2xl overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-soft-cream border-b border-moss-green/20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-moss-green/10">
            <EyeOff className="w-5 h-5 text-brand-ink" />
          </div>
          <div>
            <SlideOverTitle className="text-lg font-bold text-brand-ink">{t('secretCheck.title')}</SlideOverTitle>
            <p className="text-xs text-warm-gray">{t('secretCheck.subtitle')}</p>
          </div>
        </div>
        <SlideOverClose className="p-2 rounded-lg hover:bg-stone-gray/10 transition-colors" iconClassName="w-5 h-5 text-stone-gray" />
      </div>

      <div className="p-6 space-y-6">
        {roster.length === 0 && <p className="text-sm text-ink-muted">{t('secretCheck.noCharacters')}</p>}
        {loading && <p className="text-sm text-ink-muted">{t('secretCheck.loading')}</p>}
        {failed.map((name) => (
          <p key={name} role="alert" className="text-sm text-danger">{t('secretCheck.loadFailed', { name })}</p>
        ))}

        {passive.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-brand-ink uppercase tracking-wide mb-2">{t('secretCheck.passive')}</h3>
            <ul aria-label={t('secretCheck.passive')} className="divide-y divide-moss-green/15 rounded-lg border border-moss-green/20 bg-parchment/50">
              {passive.map(({ sheet, value }) => (
                <li key={sheet.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span>{sheet.name}</span>
                  <span className="font-semibold tabular-nums">{value}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {read.length > 0 && (
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-brand-ink uppercase tracking-wide mb-2">{t('secretCheck.characters')}</h3>
              <ul className="space-y-1">
                {read.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-center gap-2 text-sm min-h-8">
                      <input
                        type="checkbox"
                        checked={!unticked.has(s.id)}
                        onChange={(e) =>
                          setUnticked((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          })
                        }
                        aria-label={s.name}
                      />
                      <span>{s.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            {choices.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('secretCheck.noChecks')}</p>
            ) : (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{t('secretCheck.check')}</span>
                  <select
                    aria-label={t('secretCheck.check')}
                    value={current ? keyOf(current) : ''}
                    onChange={(e) => setChosen(e.target.value)}
                    className="w-full rounded-lg border border-moss-green/30 bg-surface-light px-2 py-1.5"
                  >
                    {groups.map(({ group, items }) => (
                      <optgroup key={group} label={t(`secretCheck.groups.${group}`)}>
                        {items.map((c) => (
                          <option key={keyOf(c)} value={keyOf(c)}>{c.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                {showMode && (
                  <div role="radiogroup" aria-label={t('secretCheck.mode')} className="flex overflow-hidden rounded-cozy border border-moss-green/30 w-fit">
                    {ROLL_MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={mode === m}
                        onClick={() => setMode(m)}
                        className={`min-h-9 px-3 text-sm transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${mode === m ? 'bg-brand/20 font-semibold text-brand-ink' : 'text-ink-muted hover:bg-moss-green/10'}`}
                      >
                        {t(`actionBar.mode.${m}`)}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  disabled={rolling || !current}
                  onClick={() => void doRoll()}
                  className="min-h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {rolling ? t('secretCheck.rolling') : t('secretCheck.roll')}
                </button>
              </>
            )}
          </section>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        {run && (
          <section>
            <h3 className="text-sm font-semibold text-brand-ink uppercase tracking-wide mb-2">{t('secretCheck.results')}</h3>
            <ul className="space-y-2">
              {run.rows.map(({ sheet, option, expression }) => {
                const result = run.results.find((r) => r.characterId === sheet.id);
                const hasPlayer = memberRole(sheet.userId) === 'PLAYER';
                const natural = result ? keptD20(expression, result.dice) : null;
                return (
                  <li key={sheet.id} data-testid={`result-${sheet.id}`} className="rounded-lg border border-moss-green/20 bg-parchment/50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{sheet.name}</span>
                      {option && result ? (
                        <span className="text-lg font-bold tabular-nums">{result.total}</span>
                      ) : (
                        <span className="text-ink-muted">{t('secretCheck.noCheckFor')}</span>
                      )}
                    </div>
                    {option && result && (
                      <p className="text-xs text-ink-muted">
                        {natural !== null ? `d20 ${natural} ${result.total - natural < 0 ? '−' : '+'} ${Math.abs(result.total - natural)}` : result.breakdown}
                        {natural === 20 || natural === 1 ? <strong className="ml-2">{t('secretCheck.natural', { n: natural })}</strong> : null}
                      </p>
                    )}
                    {option && result && (
                      <div className="mt-1">
                        {hasPlayer ? (
                          noticeFor === sheet.id ? (
                            <div className="space-y-1">
                              <textarea
                                aria-label={t('secretCheck.noticeLabel', { name: sheet.name })}
                                value={noticeText}
                                maxLength={500}
                                onChange={(e) => setNoticeText(e.target.value)}
                                rows={2}
                                className="w-full rounded-lg border border-moss-green/30 bg-surface-light px-2 py-1"
                              />
                              <div className="flex items-center gap-2">
                                <button type="button" disabled={sending || noticeText.trim() === ''} onClick={() => void sendNotice(sheet.id)} className="min-h-8 rounded-lg bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50">{t('secretCheck.send')}</button>
                                <button type="button" onClick={() => { setNoticeFor(null); setNoticeError(null); }} className="min-h-8 px-2 text-sm text-ink-muted">{t('secretCheck.cancel')}</button>
                                <span className="ml-auto text-xs text-ink-muted">{t('secretCheck.noticeHint', { count: noticeText.length })}</span>
                              </div>
                              {noticeError && <p role="alert" className="text-xs text-danger">{noticeError}</p>}
                            </div>
                          ) : (
                            <>
                              <button type="button" onClick={() => { setNoticeFor(sheet.id); setNoticeText(''); setNoticeError(null); setSentTo(null); }} className="text-sm font-medium text-brand-ink underline">{t('secretCheck.notify')}</button>
                              {sentTo === sheet.id && <span role="status" className="ml-2 text-xs text-ink-muted">{t('secretCheck.sent')}</span>}
                            </>
                          )
                        ) : (
                          <p className="text-xs text-ink-muted">{t('secretCheck.noPlayer')}</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </SlideOver>
  );
}
