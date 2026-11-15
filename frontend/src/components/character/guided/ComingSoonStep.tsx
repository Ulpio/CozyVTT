// ============================================
// Stands in for the steps after the ability scores until they are built.
// ============================================

import { useTranslation } from 'react-i18next';

export default function ComingSoonStep() {
  const { t } = useTranslation();
  return <p className="text-sm text-warm-gray">{t('guidedCreation.comingSoon')}</p>;
}
