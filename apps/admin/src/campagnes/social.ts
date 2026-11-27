import { fileUrl, HuidlyError as SoError, jsonInit, teamCall } from '../huidly/client';

// Social planning: the posts, stories and reels Pure plans for Instagram, Facebook and TikTok. They are kept in Huidly's
// data (huidly repo, api/src/functions/social.js) and reached with the team's Huidly connection (../huidly/client.ts);
// posting itself stays in Meta Business Suite.
// Times are Dutch time (Europe/Amsterdam) wherever the person reading happens to be, so a planner opened in Istanbul
// shows the same 19:30 as one opened in Nijmegen.

export const SO_CHANNELS = ['instagram', 'facebook', 'tiktok'] as const;
export const SO_KINDS = ['post', 'carousel', 'story', 'reel'] as const;
/** In order: concept → wacht op akkoord → akkoord → gepland → geplaatst. */
export const SO_STATUSES = ['concept', 'review', 'approved', 'scheduled', 'posted'] as const;

export type SoChannel = (typeof SO_CHANNELS)[number];
export type SoKind = (typeof SO_KINDS)[number];
export type SoStatus = (typeof SO_STATUSES)[number];

export type SoMedia = { id: string; type: 'image' | 'video'; url: string };

export type SoPost = {
  id: string;
  channel: SoChannel;
  kind: SoKind;
  /** ISO with offset, e.g. 2026-12-02T19:30:00+01:00. */
  at: string;
  caption: string;
  media: SoMedia[];
  status: SoStatus;
  note: string;
  createdBy: string;
  updatedAt: string;
};

export type SoDraft = Pick<SoPost, 'channel' | 'kind' | 'at' | 'caption' | 'media' | 'status' | 'note'>;

export const MAX_CAPTION = 2200;
export const MAX_NOTE = 2000;
export const MAX_FILE = 25 * 1024 * 1024;
export const FILE_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';
const FILE_TYPES = FILE_ACCEPT.split(',');

/** What Huidly answered when it said no: the status and its short code (signin-needed, not-a-member, too-large…). */
export { SoError };

const files = (media: SoMedia[]) => media.map((m) => ({ ...m, url: fileUrl(m.url) }));
const withFiles = (post: SoPost): SoPost => ({ ...post, media: files(post.media) });

export const listPosts = (from: string, to: string) => teamCall<{ posts: SoPost[] }>(`/social?from=${from}&to=${to}`).then((r) => r.posts.map(withFiles));
export const createPost = (draft: SoDraft) => teamCall<{ post: SoPost }>('/social', jsonInit('POST', draft)).then((r) => withFiles(r.post));
export const updatePost = (id: string, patch: Partial<SoDraft>) =>
  teamCall<{ post: SoPost }>(`/social/${encodeURIComponent(id)}`, jsonInit('PATCH', patch)).then((r) => withFiles(r.post));
export const deletePost = (id: string) => teamCall<{ ok: true }>(`/social/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Sends one image or video; checks type and size first so the person hears it before the upload starts. */
export function uploadMedia(file: File): Promise<SoMedia> {
  if (!FILE_TYPES.includes(file.type)) return Promise.reject(new SoError(415, 'bad-type'));
  if (file.size > MAX_FILE) return Promise.reject(new SoError(413, 'too-large'));
  return teamCall<{ media: SoMedia }>('/media', { method: 'POST', headers: { 'Content-Type': file.type }, body: file }).then((r) => ({ ...r.media, url: fileUrl(r.media.url) }));
}

// ── Dutch time ────────────────────────────────────────────────────────────

export const ZONE = 'Europe/Amsterdam';

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The Dutch day and time of a moment: { day: '2026-12-02', time: '19:30' }. */
export function dutch(at: string | Date): { day: string; time: string } {
  const date = typeof at === 'string' ? new Date(at) : at;
  const p = Object.fromEntries(parts.formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** A Dutch day and time as a moment with the right offset: +01:00 in winter, +02:00 in summer. */
export function dutchAt(day: string, time: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  for (const offset of [1, 2]) {
    const guess = new Date(Date.UTC(y, m - 1, d, h - offset, min));
    const back = dutch(guess);
    if (back.day === day && back.time === time) return `${day}T${time}:00+0${offset}:00`;
  }
  // The hour that does not exist when the clocks go forward: take winter time.
  return `${day}T${time}:00+01:00`;
}

/** A calendar day as a local noon Date, for the panel's own date words ("vr 4 dec"). */
export const dayDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The first image of a post (a reel's cover), else its first video. */
export const thumbOf = (post: Pick<SoPost, 'media'>) => post.media.find((m) => m.type === 'image') ?? post.media[0];

/** The first line of a caption, for a calendar cell. */
export const firstLine = (caption: string) => caption.split('\n').find((l) => l.trim())?.trim() ?? '';
