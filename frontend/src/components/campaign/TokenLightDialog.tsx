// ============================================
// TokenLightDialog
//
// "Luz > Personalizar..." on a token's menu: a bright radius, a dim radius
// (both in grid squares, 0 to 120, bright never past dim) and a colour. It
// applies a light set by hand; the server judges it again.
// ============================================

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { TOKEN_LIGHT_MAX_RADIUS, tokenLightValid, type TokenLight } from '@/utils/tokenLights';
import { FLAME_COLOR } from './map/tokenLightChoices';

interface TokenLightDialogProps {
  name: string;
  /** The light it has now, to start from. */
  initial: TokenLight | null;
  onApply: (light: TokenLight) => void;
  onClose: () => void;
}

export default function TokenLightDialog({ name, initial, onApply, onClose }: TokenLightDialogProps) {
  const { t } = useTranslation();
  const [bright, setBright] = useState(String(initial?.brightRadius ?? 0));
  const [dim, setDim] = useState(String(initial?.dimRadius ?? 4));
  const [color, setColor] = useState(initial?.color ?? FLAME_COLOR);
  const ids = [useId(), useId(), useId()];

  const light: TokenLight = { brightRadius: Number(bright), dimRadius: Number(dim), color: color.toLowerCase(), source: 'manual' };
  const valid = bright.trim() !== '' && dim.trim() !== '' && tokenLightValid(light);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onApply(light);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={t('tokenLight.title', { name })} icon={Lightbulb} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={ids[0]} className="block text-xs font-medium text-stone-gray mb-1.5">{t('tokenLight.bright')}</label>
          <input id={ids[0]} type="number" inputMode="decimal" min={0} max={TOKEN_LIGHT_MAX_RADIUS} step="any" value={bright}
            onChange={(e) => setBright(e.target.value)} autoFocus className="input-cozy w-full text-sm pointer-coarse:min-h-11" />
        </div>
        <div>
          <label htmlFor={ids[1]} className="block text-xs font-medium text-stone-gray mb-1.5">{t('tokenLight.dim')}</label>
          <input id={ids[1]} type="number" inputMode="decimal" min={0} max={TOKEN_LIGHT_MAX_RADIUS} step="any" value={dim}
            onChange={(e) => setDim(e.target.value)} className="input-cozy w-full text-sm pointer-coarse:min-h-11" />
          <p className="text-xs text-warm-gray mt-1">{t('tokenLight.hint')}</p>
        </div>
        <div>
          <label htmlFor={ids[2]} className="block text-xs font-medium text-stone-gray mb-1.5">{t('tokenLight.color')}</label>
          <input id={ids[2]} type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : FLAME_COLOR}
            onChange={(e) => setColor(e.target.value)} className="h-10 w-16 cursor-pointer rounded-sm" />
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" className="touch-target" onClick={onClose}>{t('tokenLight.cancel')}</Button>
          <Button type="submit" className="touch-target" disabled={!valid}>{t('tokenLight.apply')}</Button>
        </div>
      </form>
    </Modal>
  );
}
