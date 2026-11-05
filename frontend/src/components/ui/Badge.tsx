import { BADGE_DOT, type BadgeTone } from './styles';

interface BadgeProps {
  tone?: BadgeTone;
  title?: string;
  children: string;
}

/** Always shows a text label. The coloured dot repeats the meaning but never carries it alone. */
export function Badge({ tone = 'neutral', title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-page px-2.5 py-0.5 text-xs font-medium text-ink-2"
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${BADGE_DOT[tone]}`} />
      {children}
    </span>
  );
}
