import type { IconType } from 'react-icons';

/** A decorative icon for an action-bar button, drawn in the button's text colour. */
export default function ActionIcon({ icon: Icon, size = 24 }: { icon: IconType; size?: number }) {
  return (
    <span aria-hidden="true" data-testid="action-icon" className="inline-flex shrink-0">
      <Icon size={size} color="currentColor" />
    </span>
  );
}
