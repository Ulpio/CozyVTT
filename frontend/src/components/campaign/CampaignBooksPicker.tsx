// ============================================
// The compendium books a campaign uses: one box per book of its system.
// The create and settings modals both show it; the caller saves the list.
// ============================================

import { useTranslation } from 'react-i18next';
import type { CampaignBookChoice } from '@/types';

interface CampaignBooksPickerProps {
  books: CampaignBookChoice[];
  onChange: (bookIds: string[]) => void;
  disabled?: boolean;
}

export default function CampaignBooksPicker({ books, onChange, disabled }: CampaignBooksPickerProps) {
  const { t } = useTranslation();

  const toggle = (id: string, on: boolean) =>
    onChange(books.filter((b) => (b.id === id ? on : b.enabled)).map((b) => b.id));

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold text-stone-gray">{t('campaignBooks.legend')}</legend>
      {books.length === 0 ? (
        <p className="text-xs text-warm-gray">{t('campaignBooks.none')}</p>
      ) : (
        <ul className="space-y-1">
          {books.map((book) => (
            <li key={book.id}>
              <label className="flex items-center gap-2 text-sm text-ink touch-target">
                <input
                  type="checkbox"
                  checked={book.enabled}
                  onChange={(e) => toggle(book.id, e.target.checked)}
                  className="h-4 w-4 accent-moss-green"
                />
                {book.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
