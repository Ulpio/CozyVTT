// ============================================
// Compendium Panel: the admin's Compendium tab
// Search the rules data imported from the books, open an entry, and correct
// its name, English name, text or data. The server checks the data against
// the entry's type and marks the entry corrected, so a new import of the
// books leaves it as it is (backend src/compendium/importer.ts).
// The data is edited as JSON for now; forms for each type come when the
// character builder and the action bar need them.
// ============================================

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { api } from '@/services/api';
import type { CompendiumBook, CompendiumEntry, CompendiumEntrySummary } from '@/types';
import Button from '@/components/ui/Button';
import { apiErrorMessage } from '@/utils/errors';

const TYPES = [
  'spell',
  'race',
  'subrace',
  'class',
  'subclass',
  'background',
  'feat',
  'weapon',
  'armor',
  'gear',
  'tool',
  'pack',
  'magicItem',
  'condition',
] as const;

type EntryType = (typeof TYPES)[number];
const isEntryType = (type: string): type is EntryType => (TYPES as readonly string[]).includes(type);

interface Form {
  name: string;
  nameEn: string;
  text: string;
  data: string;
}

const formOf = (entry: CompendiumEntry): Form => ({
  name: entry.name,
  nameEn: entry.nameEn ?? '',
  text: entry.text,
  data: JSON.stringify(entry.data, null, 2),
});

export default function CompendiumPanel() {
  const { t, i18n } = useTranslation();
  const [books, setBooks] = useState<CompendiumBook[]>([]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [book, setBook] = useState('');
  const [results, setResults] = useState<{ items: CompendiumEntrySummary[]; total: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [entry, setEntry] = useState<CompendiumEntry | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  useEffect(() => {
    api.getCompendiumBooks().then(setBooks).catch(() => setBooks([]));
  }, []);

  const typeLabel = (value: string) => (isEntryType(value) ? t(`compendium.types.${value}`) : value);
  const bookName = (id: string) => books.find((b) => b.id === id)?.name ?? id;

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setMessage(null);
    try {
      setResults(await api.searchCompendium({ q: query || undefined, type: type || undefined, book: book || undefined, pageSize: 50 }));
    } catch (err) {
      setMessage({ kind: 'error', text: apiErrorMessage(err) ?? String(err) });
    } finally {
      setSearching(false);
    }
  };

  const open = async (id: string) => {
    setMessage(null);
    try {
      const loaded = await api.getCompendiumEntry(id);
      setEntry(loaded);
      setForm(formOf(loaded));
    } catch (err) {
      setMessage({ kind: 'error', text: apiErrorMessage(err) ?? String(err) });
    }
  };

  const save = async () => {
    if (!entry || !form) return;
    let data: unknown;
    try {
      data = JSON.parse(form.data);
    } catch {
      setMessage({ kind: 'error', text: t('compendium.invalidJson') });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateCompendiumEntry(entry.id, {
        name: form.name,
        nameEn: form.nameEn.trim() || null,
        text: form.text,
        data,
      });
      setEntry(updated);
      setForm(formOf(updated));
      setMessage({ kind: 'ok', text: t('compendium.saved') });
    } catch (err) {
      setMessage({ kind: 'error', text: apiErrorMessage(err) ?? String(err) });
    } finally {
      setSaving(false);
    }
  };

  const field = 'input-cozy w-full';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-brand-ink">{t('compendium.title')}</h2>
        <p className="text-sm text-warm-gray">{t('compendium.intro')}</p>
      </div>

      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-48">
          <label htmlFor="compendium-q" className="sr-only">{t('compendium.search')}</label>
          <input id="compendium-q" className={field} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div>
          <label htmlFor="compendium-type" className="sr-only">{t('compendium.type')}</label>
          <select id="compendium-type" className={field} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t('compendium.anyType')}</option>
            {TYPES.map((value) => (
              <option key={value} value={value}>{typeLabel(value)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="compendium-book" className="sr-only">{t('compendium.book')}</label>
          <select id="compendium-book" className={field} value={book} onChange={(e) => setBook(e.target.value)}>
            <option value="">{t('compendium.anyBook')}</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={searching} className="flex items-center gap-2">
          <Search className="w-4 h-4" aria-hidden="true" />
          {t('compendium.search')}
        </Button>
      </form>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-sm text-danger-ink' : 'text-sm text-success-ink'}>
          {message.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="space-y-2 min-w-0">
          {results && <p className="text-sm text-warm-gray">{t('compendium.count', { count: results.total })}</p>}
          {results && results.items.length === 0 && <p className="text-sm text-warm-gray">{t('compendium.empty')}</p>}
          <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
            {results?.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void open(item.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                    entry?.id === item.id ? 'border-brand/50 bg-brand/10' : 'border-moss-green/20 hover:bg-moss-green/10'
                  }`}
                >
                  <span className="font-medium text-ink">{item.name}</span>
                  <span className="block text-xs text-warm-gray">
                    {typeLabel(item.type)} · {bookName(item.bookId)}
                    {item.nameEn ? ` · ${item.nameEn}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="min-w-0">
          {!entry || !form ? (
            <p className="text-sm text-warm-gray">{t('compendium.pick')}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-warm-gray">
                {typeLabel(entry.type)} · {bookName(entry.bookId)} · {entry.slug}
                {entry.editedAt &&
                  ` · ${t('compendium.edited', { date: new Date(entry.editedAt).toLocaleDateString(i18n.language) })}`}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="compendium-name" className="block text-sm font-medium text-brand-ink mb-1">{t('compendium.name')}</label>
                  <input id="compendium-name" className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="compendium-name-en" className="block text-sm font-medium text-brand-ink mb-1">{t('compendium.nameEn')}</label>
                  <input id="compendium-name-en" className={field} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
                </div>
              </div>
              <div>
                <label htmlFor="compendium-text" className="block text-sm font-medium text-brand-ink mb-1">{t('compendium.text')}</label>
                <textarea id="compendium-text" rows={8} className={field} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
              </div>
              <div>
                <label htmlFor="compendium-data" className="block text-sm font-medium text-brand-ink mb-1">{t('compendium.data')}</label>
                <textarea
                  id="compendium-data"
                  rows={12}
                  spellCheck={false}
                  className={`${field} font-mono text-xs`}
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                />
              </div>
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? t('compendium.saving') : t('compendium.save')}
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
