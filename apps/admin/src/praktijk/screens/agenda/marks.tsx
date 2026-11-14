import type { ApptStatus } from '../../data/agenda';
import { PkIcon } from '../../icons';

/** SkinAdmin's euro sign in its four colours, or the shield when the insurer pays. */
export function StatusMark({ status, size = 13 }: { status: ApptStatus; size?: number }) {
  if (status === 'insurer')
    return (
      <span className="pk-ag-mark pk-ag-mark--insurer">
        <PkIcon name="shieldCheck" size={size} stroke={2} />
      </span>
    );
  return (
    <span className={`pk-ag-mark pk-ag-mark--${status}`}>
      <PkIcon name="euro" size={size} stroke={2.2} />
    </span>
  );
}

/** The report square: an outline in the treatment's colour while the report is empty, filled once it is written. */
export function ReportMark({ filled, color }: { filled: boolean; color: string }) {
  return <i className={`pk-ag-square ${filled ? 'is-filled' : ''}`} style={{ ['--c' as string]: color }} />;
}

/** A calendar with a cross: an online booking that is no longer where the client put it. */
export function CalendarCross({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <path d="M4 6.5h16v13.5H4zM4 10.5h16M8.5 3.5v5M15.5 3.5v5M9.5 13l5 5M14.5 13l-5 5" />
    </svg>
  );
}
