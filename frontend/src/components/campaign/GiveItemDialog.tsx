// ============================================
// GiveItemDialog
//
// "Dar item..." on a character's menu, for the GM: one item from the
// compendium (the campaign's books, item types only) or a free one, and how
// many. "Dar" sends `character.item.give` and waits for the server's answer;
// a refusal ("A mochila está cheia.", ...) shows here as it arrives and the
// dialog stays open, so nothing typed is lost.
// ============================================

import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import ItemIcon from '@/components/character-sheets/fifth-edition/components/ItemIcon';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { api } from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import type { CompendiumEntrySummary, GiveItemRequest } from '@/types';

/** The compendium types that are things a character carries. */
const ITEM_TYPES = ['weapon', 'armor', 'gear', 'tool', 'pack', 'magicItem'] as const;
const MIN_LETTERS = 2;
const SEARCH_DELAY_MS = 250;
const MAX_RESULTS = 40;

interface GiveItemDialogProps {
  campaignId: string;
  characterId: string;
  characterName: string;
  /** The item went in; `noticeSent` is false when nobody plays the character. */
  onGiven: (noticeSent: boolean) => void;
  onClose: () => void;
}

/** A whole number from 1 to 999, or null. */
function quantityOf(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= 999 ? n : null;
}

export default function GiveItemDialog({ campaignId, characterId, characterName, onGiven, onClose }: GiveItemDialogProps) {
  const { t } = useTranslation();
  const { socket } = useWebSocket();
  const ids = useId();
  const [free, setFree] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompendiumEntrySummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [chosen, setChosen] = useState<CompendiumEntrySummary | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = query.trim();
  useEffect(() => {
    if (free || typed.length < MIN_LETTERS) {
      setResults(null);
      setSearching(false);
      setSearchFailed(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void Promise.all(ITEM_TYPES.map((type) => api.searchCompendium({ q: typed, type, campaignId, pageSize: 15 })))
        .then((pages) => {
          if (!alive) return;
          const merged = pages.flatMap((p) => p.items).sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_RESULTS);
          setResults(merged);
          setSearchFailed(false);
        })
        .catch(() => {
          if (alive) setSearchFailed(true);
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [typed, free, campaignId]);

  const count = quantityOf(quantity);
  const trimmedName = name.trim();
  const ready = count !== null && (free ? trimmedName !== '' : chosen !== null);

  const give = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || count === null || sending) return;
    if (!socket) {
      setError(t('giveItem.noConnection'));
      return;
    }
    const request: GiveItemRequest = free
      ? { characterId, name: trimmedName, ...(notes.trim() ? { notes: notes.trim() } : {}), quantity: count }
      : { characterId, ref: { bookId: chosen!.bookId, slug: chosen!.slug }, quantity: count };
    setSending(true);
    setError(null);
    try {
      const ack = await socket.giveItem(request);
      if (!ack.ok) {
        setError(ack.error);
        return;
      }
      onGiven(ack.noticeSent);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err) || t('giveItem.noConnection'));
    } finally {
      setSending(false);
    }
  };

  const typeLabel = (type: string) => ((ITEM_TYPES as readonly string[]).includes(type) ? t(`compendium.types.${type}` as never) : type);

  return (
    <Modal open onClose={onClose} title={t('giveItem.title', { name: characterName })} icon={Gift} size="md" closeDisabled={sending}>
      <form onSubmit={(e) => void give(e)} className="space-y-4">
        <div role="radiogroup" aria-label={t('giveItem.mode')} className="flex overflow-hidden rounded-cozy border border-moss-green/30 w-fit">
          {[false, true].map((isFree) => (
            <button
              key={String(isFree)}
              type="button"
              role="radio"
              aria-checked={free === isFree}
              onClick={() => { setFree(isFree); setError(null); }}
              className={`min-h-9 px-3 text-sm transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${free === isFree ? 'bg-brand/20 font-semibold text-brand-ink' : 'text-ink-muted hover:bg-moss-green/10'}`}
            >
              {t(isFree ? 'giveItem.free' : 'giveItem.fromCompendium')}
            </button>
          ))}
        </div>

        {free ? (
          <div className="space-y-3">
            <div>
              <label htmlFor={`${ids}-name`} className="block text-xs font-medium text-stone-gray mb-1.5">{t('giveItem.name')}</label>
              <input id={`${ids}-name`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus className="input-cozy w-full text-sm pointer-coarse:min-h-11" />
            </div>
            <div>
              <label htmlFor={`${ids}-notes`} className="block text-xs font-medium text-stone-gray mb-1.5">{t('giveItem.notes')}</label>
              <textarea id={`${ids}-notes`} value={notes} maxLength={500} rows={3} onChange={(e) => setNotes(e.target.value)} className="input-cozy w-full text-sm" />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="search"
              aria-label={t('giveItem.search')}
              placeholder={t('giveItem.searchPlaceholder')}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setChosen(null); }}
              autoFocus
              className="input-cozy w-full text-sm pointer-coarse:min-h-11"
            />
            {typed.length < MIN_LETTERS && <p className="text-xs text-warm-gray">{t('giveItem.typeHint')}</p>}
            {searching && <p className="text-xs text-warm-gray">{t('giveItem.searching')}</p>}
            {searchFailed && <p role="alert" className="text-xs text-danger">{t('giveItem.searchFailed')}</p>}
            {!searching && !searchFailed && results && results.length === 0 && <p className="text-sm text-warm-gray">{t('giveItem.noResults')}</p>}
            {results && results.length > 0 && (
              <ul className="max-h-60 space-y-1 overflow-y-auto">
                {results.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={chosen?.id === item.id}
                      onClick={() => setChosen(item)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg border transition-colors ${chosen?.id === item.id ? 'border-brand/50 bg-brand/10' : 'border-moss-green/20 hover:bg-moss-green/10'}`}
                    >
                      <span className="flex items-center gap-2">
                        <ItemIcon item={{ name: item.name, compendiumRef: { bookId: item.bookId, slug: item.slug } }} entryType={item.type} size={32} />
                        <span className="min-w-0">
                          <span className="font-medium text-ink">{item.name}</span>
                          <span className="block text-xs text-warm-gray">
                            {typeLabel(item.type)}{item.nameEn ? ` · ${item.nameEn}` : ''}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {chosen && <p className="text-sm font-medium text-brand-ink">{t('giveItem.chosen', { name: chosen.name })}</p>}
          </div>
        )}

        <div>
          <label htmlFor={`${ids}-qty`} className="block text-xs font-medium text-stone-gray mb-1.5">{t('giveItem.quantity')}</label>
          <input
            id={`${ids}-qty`}
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="input-cozy w-24 text-sm pointer-coarse:min-h-11"
          />
        </div>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" className="touch-target" onClick={onClose} disabled={sending}>{t('giveItem.cancel')}</Button>
          <Button type="submit" className="touch-target" disabled={!ready || sending}>{sending ? t('giveItem.giving') : t('giveItem.give')}</Button>
        </div>
      </form>
    </Modal>
  );
}
