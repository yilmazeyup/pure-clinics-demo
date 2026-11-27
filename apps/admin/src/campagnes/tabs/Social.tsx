import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { HuidlyConnect, HuidlyConnected } from '../../huidly/Connect';
import { useHuidlyTeam } from '../../huidly/client';
import { useToast } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { PkIcon, type PkIconName } from '../../praktijk/icons';
import { Card, Chip, Field, Modal, Seg, Steps, type Tone } from '../../praktijk/kit';
import { MOMENTS } from '../data';
import {
  createPost,
  dayDate,
  dayKey,
  deletePost,
  dutch,
  dutchAt,
  FILE_ACCEPT,
  firstLine,
  listPosts,
  MAX_CAPTION,
  MAX_NOTE,
  SO_CHANNELS,
  SO_KINDS,
  SO_STATUSES,
  SoError,
  thumbOf,
  updatePost,
  uploadMedia,
  type SoChannel,
  type SoDraft,
  type SoKind,
  type SoMedia,
  type SoPost,
  type SoStatus,
} from '../social';
import './social.css';

type View = 'month' | 'list';
type Load = 'loading' | 'ready' | 'signin' | 'denied' | 'error';
type Editing = { post: SoPost | null; day: string } | null;

const STATUS_TONE: Record<SoStatus, Tone> = { concept: 'outline', review: 'warn', approved: 'good', scheduled: 'brand', posted: 'neutral' };
const STATUS_ICON: Record<SoStatus, PkIconName> = { concept: 'edit', review: 'eye', approved: 'check', scheduled: 'clock', posted: 'send' };
const CHANNEL_SHORT: Record<SoChannel, string> = { instagram: 'IG', facebook: 'FB', tiktok: 'TT' };
const ERRORS: Record<string, MessageKey> = {
  'signin-needed': 'cp.so.err.signin',
  'not-a-member': 'cp.so.err.denied',
  'too-large': 'cp.so.err.tooLarge',
  'bad-type': 'cp.so.err.type',
  'caption-too-long': 'cp.so.err.caption',
  'bad-at': 'cp.so.err.at',
  'not-found': 'cp.so.err.gone',
  offline: 'cp.so.err.offline',
};

const statusKey = (s: SoStatus) => `cp.so.status.${s}` as const;
const kindKey = (k: SoKind) => `cp.so.kind.${k}` as const;
const channelKey = (c: SoChannel) => `cp.so.channel.${c}` as const;
const errorKey = (error: unknown): MessageKey => (error instanceof SoError && ERRORS[error.code]) || 'cp.so.err.other';

/** Monday of the week the day is in. */
const weekStart = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7), 12);

/** The days of the month grid: whole weeks from the Monday before the 1st to the Sunday after the last day. */
function gridOf(month: Date) {
  const start = weekStart(new Date(month.getFullYear(), month.getMonth(), 1, 12));
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  const count = Math.ceil((Math.round((last.getTime() - start.getTime()) / 86400000) + 1) / 7) * 7;
  return Array.from({ length: count }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12));
}

/** Social planning: what goes on Instagram, Facebook and TikTok, by month or as a list; posting stays in Meta. */
export function SocialTab() {
  const { t, monthYear, weekdayShort } = useI18n();
  // The posts live in Huidly: without the team's connection in this browser, the tab asks for it first.
  const team = useHuidlyTeam();
  const today = dutch(new Date()).day;
  const [view, setView] = useState<View>('month');
  const [month, setMonth] = useState(() => {
    const d = dayDate(today);
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const [posts, setPosts] = useState<SoPost[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [round, setRound] = useState(0);
  const [channel, setChannel] = useState<SoChannel | 'all'>('all');
  const [status, setStatus] = useState<SoStatus | 'all'>('all');
  const [editing, setEditing] = useState<Editing>(null);

  const days = useMemo(() => gridOf(month), [month]);
  const from = dayKey(days[0]);
  const to = dayKey(days[days.length - 1]);

  useEffect(() => {
    if (!team) return setLoad('signin');
    let live = true;
    setLoad((l) => (l === 'ready' ? 'ready' : 'loading'));
    listPosts(from, to).then(
      (list) => {
        if (!live) return;
        setPosts(list);
        setLoad('ready');
      },
      (error: unknown) => {
        if (!live) return;
        const code = error instanceof SoError ? error.status : 0;
        setLoad(code === 401 ? 'signin' : code === 403 ? 'denied' : 'error');
      },
    );
    return () => {
      live = false;
    };
  }, [team, from, to, round]);

  const shown = useMemo(
    () => posts.filter((p) => (channel === 'all' || p.channel === channel) && (status === 'all' || p.status === status)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    [posts, channel, status],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, SoPost[]>();
    for (const p of shown) {
      const key = dutch(p.at).day;
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return map;
  }, [shown]);
  const monthPrefix = dayKey(month).slice(0, 7);
  const inMonth = shown.filter((p) => dutch(p.at).day.startsWith(monthPrefix));
  const counts = useMemo(() => {
    const n = Object.fromEntries(SO_STATUSES.map((s) => [s, 0])) as Record<SoStatus, number>;
    for (const p of posts) if (dutch(p.at).day.startsWith(monthPrefix) && (channel === 'all' || p.channel === channel)) n[p.status] += 1;
    return n;
  }, [posts, monthPrefix, channel]);
  const momentOf = (key: string) => MOMENTS.find((m) => dayKey(m.date) === key);

  const step = (dir: 1 | -1) => setMonth(new Date(month.getFullYear(), month.getMonth() + dir, 1, 12));
  const toToday = () => {
    const d = dayDate(today);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  };
  const saved = (post: SoPost) => setPosts((list) => [...list.filter((p) => p.id !== post.id), post]);
  const removed = (id: string) => setPosts((list) => list.filter((p) => p.id !== id));
  const startNew = (day?: string) => setEditing({ post: null, day: day ?? (today.startsWith(monthPrefix) ? today : `${monthPrefix}-01`) });

  const note = (
    <p className="cp-callout cp-callout--strong so-note">
      <PkIcon name="info" size={15} />
      <span>{t('cp.so.meta')}</span>
    </p>
  );

  if (load === 'signin') {
    return (
      <div className="pk-stack so">
        <HuidlyConnect what={t('hy.why.social')} />
        {note}
      </div>
    );
  }

  if (load === 'denied' || load === 'error') {
    const key = load === 'denied' ? 'denied' : 'error';
    return (
      <div className="pk-stack so">
        <Card eyebrow={t('cp.so.eyebrow')} title={t(`cp.so.${key}Title`)}>
          <div className="so-state">
            <p>{t(`cp.so.${key}Text`)}</p>
            {load === 'error' ? (
              <button className="btn btn-ghost" onClick={() => setRound((n) => n + 1)}>
                <PkIcon name="refresh" size={15} />
                {t('cp.so.retry')}
              </button>
            ) : null}
          </div>
        </Card>
        {note}
      </div>
    );
  }

  const item = (p: SoPost) => {
    const when = dutch(p.at);
    return (
      <button key={p.id} className={`so-item is-${p.status}`} onClick={() => setEditing({ post: p, day: when.day })} title={`${when.time} · ${t(channelKey(p.channel))} · ${t(kindKey(p.kind))} · ${t(statusKey(p.status))}`}>
        <Thumb post={p} />
        <span className="so-item-text">
          <span className="so-item-top">
            <i className="cp-cal-status" aria-hidden="true" />
            <b className="pk-num">{when.time}</b>
            <ChannelMark channel={p.channel} />
          </span>
          <span className="so-item-cap">{firstLine(p.caption) || t(kindKey(p.kind))}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="pk-stack so">
      {note}
      <HuidlyConnected />
      <Card
        eyebrow={t('cp.so.eyebrow')}
        title={monthYear(month)}
        actions={
          <div className="pk-row so-actions">
            <Seg
              label={t('cp.so.view')}
              value={view}
              onChange={setView}
              options={[
                { value: 'month', label: t('cp.so.month'), icon: 'calendar' },
                { value: 'list', label: t('cp.so.list'), icon: 'list' },
              ]}
            />
            <span className="pk-row cp-cal-steps">
              <button className="icon-button small" onClick={() => step(-1)} aria-label={t('cp.so.prev')}>
                <PkIcon name="chevronStart" size={17} />
              </button>
              <button className="btn btn-ghost btn-small" onClick={toToday}>
                {t('cp.so.today')}
              </button>
              <button className="icon-button small" onClick={() => step(1)} aria-label={t('cp.so.next')}>
                <PkIcon name="chevronEnd" size={17} />
              </button>
            </span>
            <button className="btn btn-primary" onClick={() => startNew()}>
              <PkIcon name="plus" size={15} />
              {t('cp.so.new')}
            </button>
          </div>
        }
      >
        <div className="so-filters">
          <Seg
            label={t('cp.so.filterChannel')}
            value={channel}
            onChange={setChannel}
            options={[{ value: 'all' as const, label: t('cp.so.allChannels') }, ...SO_CHANNELS.map((c) => ({ value: c, label: t(channelKey(c)) }))]}
          />
          <label className="so-filter">
            <span className="cp-sr">{t('cp.so.filterStatus')}</span>
            <select className="pk-input cp-select" value={status} onChange={(e) => setStatus(e.target.value as SoStatus | 'all')}>
              <option value="all">{t('cp.so.allStatuses')}</option>
              {SO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(statusKey(s))}
                </option>
              ))}
            </select>
          </label>
          {load === 'loading' ? <span className="pk-muted so-loading">{t('cp.so.loading')}</span> : null}
        </div>

        <ul className="cp-cal-legend so-legend">
          {SO_STATUSES.map((s) => (
            <li key={s} className={`is-${s}`}>
              <i className="cp-cal-status" aria-hidden="true" />
              {t(statusKey(s))}
              <b className="pk-num">{counts[s]}</b>
            </li>
          ))}
        </ul>

        {view === 'month' ? (
          <div className="cp-cal cp-cal--month so-cal" role="grid" aria-label={monthYear(month)}>
            <div className="cp-cal-head" role="row">
              {days.slice(0, 7).map((d) => (
                <span key={d.getDay()} role="columnheader">
                  {weekdayShort(d)}
                </span>
              ))}
            </div>
            <div className="cp-cal-days">
              {days.map((d) => {
                const key = dayKey(d);
                const outside = d.getMonth() !== month.getMonth();
                const list = byDay.get(key) ?? [];
                const moment = outside ? undefined : momentOf(key);
                return (
                  <div key={key} role="gridcell" className={`cp-cal-day so-day ${outside ? 'is-outside' : ''} ${key === today ? 'is-today' : ''}`}>
                    <span className="cp-cal-date so-date">
                      <b className="pk-num">{d.getDate()}</b>
                      {outside ? null : (
                        <button className="so-day-add" onClick={() => startNew(key)} aria-label={t('cp.so.newOn', { day: { date: d } })}>
                          <PkIcon name="plus" size={13} />
                        </button>
                      )}
                    </span>
                    {moment ? (
                      <span className="cp-cal-moment" title={t(moment.key)}>
                        {t(moment.key)}
                      </span>
                    ) : null}
                    {outside ? null : <div className="so-items">{list.map(item)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {view === 'list' || inMonth.length ? (
          <div className={view === 'month' ? 'so-under' : undefined}>
            {inMonth.length ? (
              <PostList posts={inMonth} onOpen={(p) => setEditing({ post: p, day: dutch(p.at).day })} />
            ) : (
              <p className="pk-empty">{t(channel === 'all' && status === 'all' ? 'cp.so.empty' : 'cp.so.emptyFiltered')}</p>
            )}
          </div>
        ) : load === 'ready' ? (
          <p className="pk-empty so-under">{t(channel === 'all' && status === 'all' ? 'cp.so.empty' : 'cp.so.emptyFiltered')}</p>
        ) : null}
      </Card>

      {editing ? (
        <PostDialog
          key={editing.post?.id ?? `new-${editing.day}`}
          post={editing.post}
          day={editing.day}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            saved(p);
            setEditing(null);
          }}
          onDeleted={(id) => {
            removed(id);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** The month as rows: picture, day and time, channel and kind, the caption, the status. */
function PostList({ posts, onOpen }: { posts: SoPost[]; onOpen: (post: SoPost) => void }) {
  const { t, dateShort } = useI18n();
  return (
    <ul className="pk-list cp-rows so-list">
      {posts.map((p) => {
        const when = dutch(p.at);
        return (
          <li key={p.id}>
            <button className="cp-row-button so-row" onClick={() => onOpen(p)}>
              <Thumb post={p} big />
              <span className="pk-stack cp-grow so-row-text">
                <span className="so-row-top">
                  <strong className="pk-num">
                    {dateShort(dayDate(when.day))} · {when.time}
                  </strong>
                  <span className="so-row-what">
                    <ChannelMark channel={p.channel} />
                    {t(channelKey(p.channel))} · {t(kindKey(p.kind))}
                  </span>
                </span>
                {/* Two lines of text, without the empty lines between paragraphs. */}
                <span className={`so-row-cap ${p.caption ? '' : 'pk-muted'}`}>{(p.caption || p.note).replace(/\n\s*\n/g, '\n') || t('cp.so.noCaption')}</span>
              </span>
              <StatusChip status={p.status} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StatusChip({ status }: { status: SoStatus }) {
  const { t } = useI18n();
  return (
    <Chip tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>
      {t(statusKey(status))}
    </Chip>
  );
}

/** The channel as a small square with its two letters: filled for Instagram, outlined for Facebook, dark for TikTok. */
function ChannelMark({ channel }: { channel: SoChannel }) {
  const { t } = useI18n();
  return (
    <span className={`so-ch so-ch--${channel}`} title={t(channelKey(channel))} aria-hidden="true">
      {CHANNEL_SHORT[channel]}
    </span>
  );
}

/** The post's picture: the first image (a reel's cover), else a still from its video; a number when there are more. */
function Thumb({ post, big = false }: { post: Pick<SoPost, 'media' | 'kind'>; big?: boolean }) {
  const m = thumbOf(post);
  const video = post.media.some((x) => x.type === 'video');
  return (
    <span className={`so-thumb so-thumb--${post.kind} ${big ? 'so-thumb--big' : ''}`} aria-hidden="true">
      {!m ? (
        <PkIcon name="camera" size={big ? 22 : 14} />
      ) : m.type === 'image' ? (
        <img src={m.url} alt="" loading="lazy" decoding="async" />
      ) : (
        <video src={`${m.url}#t=0.5`} preload="metadata" muted playsInline />
      )}
      {video && big ? (
        <i className="so-thumb-play">
          <PkIcon name="play" size={11} />
        </i>
      ) : null}
      {post.media.length > 1 && big ? <b className="so-thumb-n pk-num">{post.media.length}</b> : null}
    </span>
  );
}

type DialogProps = {
  post: SoPost | null;
  day: string;
  onClose: () => void;
  onSaved: (post: SoPost) => void;
  onDeleted: (id: string) => void;
};

/** One post: its pictures and videos, channel, kind, Dutch day and time, status, caption and a note for the team. */
function PostDialog({ post, day: firstDay, onClose, onSaved, onDeleted }: DialogProps) {
  const { t, dateShort } = useI18n();
  const toast = useToast();
  const start = post ? dutch(post.at) : { day: firstDay, time: '10:00' };
  const [channel, setChannel] = useState<SoChannel>(post?.channel ?? 'instagram');
  const [kind, setKind] = useState<SoKind>(post?.kind ?? 'post');
  const [day, setDay] = useState(start.day);
  const [time, setTime] = useState(start.time);
  const [status, setStatus] = useState<SoStatus>(post?.status ?? 'concept');
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [note, setNote] = useState(post?.note ?? '');
  const [media, setMedia] = useState<SoMedia[]>(post?.media ?? []);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const captionLength = [...caption].length;
  const tooLong = captionLength > MAX_CAPTION;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}$/.test(time) && !tooLong && [...note].length <= MAX_NOTE;

  const add = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = [...(event.target.files ?? [])];
    event.target.value = '';
    setError(null);
    for (const file of chosen) {
      setUploading((n) => n + 1);
      try {
        const m = await uploadMedia(file);
        setMedia((list) => [...list, m]);
      } catch (e) {
        setError(errorKey(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  const move = (index: number) =>
    setMedia((list) => {
      const next = [...list];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const draft: SoDraft = { channel, kind, at: dutchAt(day, time), caption, media, status, note };
    try {
      const done = post ? await updatePost(post.id, draft) : await createPost(draft);
      toast(t('cp.so.saved'));
      onSaved(done);
    } catch (e) {
      setError(errorKey(e));
      setBusy(false);
    }
  };
  const drop = async () => {
    if (!post) return;
    if (!sure) {
      setSure(true);
      return;
    }
    setBusy(true);
    try {
      await deletePost(post.id);
      toast(t('cp.so.deleted'));
      onDeleted(post.id);
    } catch (e) {
      setError(errorKey(e));
      setBusy(false);
    }
  };

  const updated = post?.updatedAt ? dutch(post.updatedAt) : null;
  const statusIndex = SO_STATUSES.indexOf(status);

  return (
    <Modal
      open
      wide
      title={t(post ? 'cp.so.editTitle' : 'cp.so.newTitle')}
      onClose={onClose}
      footer={
        <>
          {post ? (
            <button className={`btn btn-ghost so-delete ${sure ? 'is-sure' : ''}`} onClick={drop} disabled={busy}>
              <PkIcon name="trash" size={15} />
              {t(sure ? 'cp.so.deleteSure' : 'cp.so.delete')}
            </button>
          ) : null}
          <button className="btn btn-ghost" onClick={onClose}>
            {t('cp.so.cancel')}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy || uploading > 0 || !valid}>
            {t('cp.so.save')}
          </button>
        </>
      }
    >
      <div className="so-edit">
        <section className="so-edit-media" aria-label={t('cp.so.f.media')}>
          <span className="pk-field-label">{t('cp.so.f.media')}</span>
          <ol className={`so-media-grid so-media-grid--${kind}`}>
            {media.map((m, i) => (
              <li key={`${m.id}-${i}`} className="so-media">
                {m.type === 'image' ? <img src={m.url} alt="" loading="lazy" /> : <video src={m.url} controls muted playsInline preload="metadata" />}
                <span className="so-media-tools">
                  <b className="pk-num">{i + 1}</b>
                  {i > 0 ? (
                    <button className="icon-button small" onClick={() => move(i)} aria-label={t('cp.so.media.earlier')} title={t('cp.so.media.earlier')}>
                      <PkIcon name="chevronStart" size={15} />
                    </button>
                  ) : null}
                  <button className="icon-button small" onClick={() => setMedia((list) => list.filter((_, j) => j !== i))} aria-label={t('cp.so.media.remove')} title={t('cp.so.media.remove')}>
                    <PkIcon name="close" size={15} />
                  </button>
                </span>
              </li>
            ))}
            <li className="so-media so-media--add">
              <button onClick={() => picker.current?.click()} disabled={uploading > 0}>
                <PkIcon name="upload" size={20} />
                <span>{t(uploading ? 'cp.so.media.uploading' : 'cp.so.media.add')}</span>
                <small>{t('cp.so.media.types')}</small>
              </button>
              <input ref={picker} type="file" accept={FILE_ACCEPT} multiple hidden onChange={add} />
            </li>
          </ol>
        </section>

        <div className="pk-form so-edit-form">
          <Field label={t('cp.so.f.channel')}>
            <select className="pk-input" value={channel} onChange={(e) => setChannel(e.target.value as SoChannel)}>
              {SO_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(channelKey(c))}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('cp.so.f.kind')}>
            <select className="pk-input" value={kind} onChange={(e) => setKind(e.target.value as SoKind)}>
              {SO_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(kindKey(k))}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('cp.so.f.day')}>
            <input className="pk-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-invalid={!day} />
          </Field>
          <Field label={t('cp.so.f.time')} hint={t('cp.so.f.timeHint')}>
            <input className="pk-input" type="time" value={time} step={300} onChange={(e) => setTime(e.target.value.slice(0, 5))} aria-invalid={!time} />
          </Field>

          <div className="pk-field pk-field--wide">
            <span className="pk-field-label">{t('cp.so.f.status')}</span>
            <Steps steps={SO_STATUSES.map((s) => t(statusKey(s)))} current={statusIndex} onStep={(i) => setStatus(SO_STATUSES[i])} />
            <small className="pk-field-hint">{t('cp.so.f.statusHint')}</small>
          </div>

          <Field
            wide
            label={t('cp.so.f.caption')}
            hint={
              <span className={tooLong ? 'so-over' : undefined}>
                {t('cp.so.f.captionCount', { n: captionLength, max: MAX_CAPTION })}
                {kind === 'story' ? ` · ${t('cp.so.f.storyHint')}` : ''}
              </span>
            }
          >
            <textarea className="pk-input so-caption" rows={9} value={caption} onChange={(e) => setCaption(e.target.value)} aria-invalid={tooLong} dir="auto" />
          </Field>
          <Field wide label={t('cp.so.f.note')} hint={t('cp.so.f.noteHint')}>
            <textarea className="pk-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE * 2} dir="auto" />
          </Field>
        </div>

        {error ? (
          <p className="so-error" role="alert">
            <PkIcon name="warning" size={15} />
            {t(error)}
          </p>
        ) : null}
        {post ? (
          <p className="pk-muted so-meta">
            {updated ? t('cp.so.updated', { when: `${dateShort(dayDate(updated.day))} ${updated.time}` }) : null}
            {post.createdBy ? ` · ${post.createdBy === 'seed' ? t('cp.so.bySeed') : t('cp.so.by', { name: post.createdBy })}` : null}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
