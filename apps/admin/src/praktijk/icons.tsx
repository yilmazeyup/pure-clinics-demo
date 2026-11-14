import { Icon, type IconName } from '../components/Icon';

// Extra line icons for Pure Praktijk, drawn on the same 24-unit grid and stroke as the panel's own set.
const EXTRA = {
  euro: 'M17.5 6.8a6.5 6.5 0 1 0 0 10.4M4.5 10.3h9M4.5 13.7h9',
  user: 'M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5ZM4.5 20a7.5 7.5 0 0 1 15 0',
  shield: 'M12 3.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6.3z',
  shieldCheck: 'M12 3.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6.3zM9 12l2.2 2.2L15.5 10',
  lock: 'M6 10.5h12v9.5H6zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14v2.5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  upload: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14',
  camera: 'M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  file: 'M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4M9 12.5h6M9 16h6',
  box: 'M4 7.5 12 4l8 3.5v9L12 20l-8-3.5zM4 7.5 12 11l8-3.5M12 11v9',
  truck: 'M3.5 6.5h10v9h-10zM13.5 9.5h4l3 3v3h-7M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 3.5V6M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6',
  phone: 'M7 3.5h10v17H7zM11 17.5h2',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  eyeOff: 'M4 4l16 16M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.4M6.3 7.6A16 16 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.2-1',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  edit: 'M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  send: 'M20.5 3.5 3.5 10.2l7 2.8 2.8 7zM10.5 13l10-9.5',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  warning: 'M12 4 21 19.5H3zM12 10v4.5M12 17h.01',
  info: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 11v5.5M12 8h.01',
  clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3 2',
  barcode: 'M4 6v12M6.5 6v12M9.5 6v12M11.5 6v12M14.5 6v12M17 6v12M20 6v12',
  printer: 'M7 9V4.5h10V9M7 16H5V9h14v7h-2M7.5 13.5h9v6h-9z',
  chart: 'M5 19.5V11M10 19.5V5M15 19.5v-6M20 19.5V8',
  flag: 'M5.5 20.5V4M5.5 4.5h11l-2 4 2 4h-11',
  key: 'M14.5 13a4.5 4.5 0 1 0-4.2-2.9L4 16.5V20h3.5v-2h2v-2h2l1.2-1.2a4.5 4.5 0 0 0 1.8.2ZM16 8h.01',
  building: 'M5 20.5V4h9v16.5M14 9h5v11.5M8 7.5h3M8 11h3M8 14.5h3M3.5 20.5h17',
  heart: 'M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10Z',
  gift: 'M4.5 10h15v10h-15zM3.5 7h17v3h-17zM12 7v13M12 7c-1.5-3-5-3.5-5-1.2C7 7 9.5 7 12 7Zm0 0c1.5-3 5-3.5 5-1.2C17 7 14.5 7 12 7Z',
  ticket: 'M3.5 7.5h17v3a1.5 1.5 0 0 0 0 3v3h-17v-3a1.5 1.5 0 0 0 0-3zM14.5 7.5v9',
  cash: 'M3.5 7h17v10h-17zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6.5 10v.01M17.5 14v.01',
  device: 'M5 19h14M8 19V9.5h8V19M10 9.5V5.5h4v4M12 12.5v3',
  face: 'M12 20.5c-3.6 0-6.5-3.8-6.5-8.5S8.4 3.5 12 3.5s6.5 3.8 6.5 8.5-2.9 8.5-6.5 8.5ZM9.5 10.5h.01M14.5 10.5h.01M10 15c1.2.8 2.8.8 4 0',
  pen: 'M15 4.5l4.5 4.5-10 10H5v-4.5z',
  inbox: 'M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20M4 13.5 6.5 5h11l2.5 8.5V19H4z',
  plug: 'M9 3.5v4M15 3.5v4M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0zM12 16v4.5',
  layers: 'M12 4 20.5 8.5 12 13 3.5 8.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5',
  merge: 'M6 4v5a5 5 0 0 0 5 5h7M14.5 10.5 18 14l-3.5 3.5M6 20v-4',
  swap: 'M4 8h13M13.5 4.5 17 8l-3.5 3.5M20 16H7M10.5 12.5 7 16l3.5 3.5',
  minus: 'M5 12h14',
  chevronStart: 'M14.5 6 8.5 12l6 6',
  chevronEnd: 'M9.5 6l6 6-6 6',
  chevronDown: 'M6 9.5l6 6 6-6',
  filter: 'M4 5.5h16l-6 7v6l-4 2v-8z',
  dots: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  thumb: 'M7.5 10.5v9h-3v-9zM7.5 10.5 11 3.5c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.2 6.4a2 2 0 0 1-2 1.8H7.5',
  stethoscope: 'M6 4v5a4 4 0 0 0 8 0V4M10 13v2.5a4.5 4.5 0 0 0 9 0V13M19 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  syringe: 'M15 4.5l4.5 4.5M17.2 6.8 9 15l-2-2 8.2-8.2M7 13l-2.5 2.5v4h4L11 17M10.5 9.5l1.5 1.5M13 7l1.5 1.5',
  whatsapp: 'M5 19.5l1.2-3.6A7.5 7.5 0 1 1 9.1 18.6zM9.5 9.5c0 2.5 2.5 5 5 5l1-1.5-2-1-1 1c-.8-.4-1.6-1.2-2-2l1-1-1-2z',
  sms: 'M4 5.5h16v10.5H9l-5 4zM8 10.5h.01M12 10.5h.01M16 10.5h.01',
  wand: 'M5 19 15.5 8.5M14 5.5V3.5M18.5 10H20.5M17.3 6.7l1.4-1.4M13 9.5l1.5 1.5',
  history: 'M4 12a8 8 0 1 0 2.3-5.7M4 4.5v3.5h3.5M12 8v4l3 2',
} as const;

export type PkIconName = IconName | keyof typeof EXTRA;

/** The panel's icons plus the extra ones of the practice module. */
export function PkIcon({ name, size = 20, stroke = 1.6 }: { name: PkIconName; size?: number; stroke?: number }) {
  if (!(name in EXTRA)) return <Icon name={name as IconName} size={size} stroke={stroke} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'grip' || name === 'dots' ? stroke * 1.8 : stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={EXTRA[name as keyof typeof EXTRA]} />
    </svg>
  );
}
