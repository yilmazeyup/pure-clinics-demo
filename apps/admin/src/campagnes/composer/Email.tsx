import { LOCATIONS } from '@pure-clinics/shared';
import { useRef, useState, type ReactNode } from 'react';

import { useI18n, type MessageKey } from '../../i18n';
import { PkIcon, type PkIconName } from '../../praktijk/icons';
import { Card, Check, Chip, Field, Seg } from '../../praktijk/kit';
import { newBlock, utmQuery, type Block, type BlockKind, type Campaign, type PriceLine } from '../data';
import { segmentKey, useCp } from '../state';
import { useWhen } from '../ui';
import { Comments, inQuiet, insertAt, JobSteps, SegmentSelect, useJob, When } from './Composer';

const KINDS: { kind: BlockKind; icon: PkIconName; key: MessageKey }[] = [
  { kind: 'heading', icon: 'pen', key: 'cp.block.heading' },
  { kind: 'text', icon: 'edit', key: 'cp.block.text' },
  { kind: 'offer', icon: 'ticket', key: 'cp.block.offer' },
  { kind: 'button', icon: 'link', key: 'cp.block.button' },
  { kind: 'image', icon: 'camera', key: 'cp.block.image' },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.kind, k])) as Record<BlockKind, (typeof KINDS)[number]>;

const FNAME = '*|FNAME|*';
const SENDERS = ['Pure Clinics', 'Pure Clinics Nijmegen', 'Pure Clinics Uden'];
const PLAN_STEPS = ['cp.plan.create', 'cp.plan.content', 'cp.plan.segment', 'cp.plan.schedule'] as const;

/** The e-mail composer: the envelope, the blocks, the preview, review notes and the way to Mailchimp. */
export function EmailEditor({ campaign: c }: { campaign: Campaign }) {
  const { t, num } = useI18n();
  const { now, update, segment, prefs, demo } = useCp();
  const when = useWhen();
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [fill, setFill] = useState(true);
  const [testTo, setTestTo] = useState(prefs.replyTo);
  const [job, run] = useJob();
  const last = useRef<{ id: string; field: 'text' | 'title' | 'extra'; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const locked = c.status === 'sent' || c.status === 'scheduled' || Boolean(job);
  const reach = c.segment === 'all' ? segment('all').email : segment(c.segment).email;
  const tag = segment(c.segment).tag;

  const setBlocks = (blocks: Block[]) => update(c.id, { blocks });
  const patch = (id: string, p: Partial<Block>) => update(c.id, (x) => ({ blocks: x.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
  const move = (index: number, dir: -1 | 1) => {
    const list = [...c.blocks];
    const [b] = list.splice(index, 1);
    list.splice(index + dir, 0, b);
    setBlocks(list);
  };
  const focus = (id: string, field: 'text' | 'title' | 'extra') => (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    last.current = { id, field, el: e.currentTarget };
  };
  const insertName = () => {
    const target = last.current ?? (() => {
      const b = c.blocks.find((x) => x.kind === 'text');
      return b ? { id: b.id, field: 'text' as const, el: null } : null;
    })();
    if (!target) return;
    const block = c.blocks.find((b) => b.id === target.id);
    if (!block) return;
    const value = insertAt(target.el, block[target.field] ?? '', FNAME);
    patch(block.id, target.field === 'title' ? { title: value } : target.field === 'extra' ? { extra: value } : { text: value });
  };

  const problems: MessageKey[] = [];
  if (!c.subject.trim()) problems.push('cp.check.subject');
  if (!c.blocks.length) problems.push('cp.check.blocks');
  if (c.sendAt.getTime() <= now.getTime()) problems.push('cp.check.past');
  if (!reach) problems.push('cp.check.nobody');
  const warnings: MessageKey[] = [];
  if (prefs.emailNight && inQuiet(c.sendAt, '22:00', '07:00')) warnings.push('cp.check.night');
  if (!c.preview.trim()) warnings.push('cp.check.preview');
  if (c.comments.some((m) => !m.resolved)) warnings.push('cp.check.comments');
  if (c.blocks.some((b) => (b.kind === 'button' && !b.text.trim()) || (b.kind === 'heading' && !b.text.trim()))) warnings.push('cp.check.empty');

  const plan = () =>
    run(PLAN_STEPS.length, () => {
      update(c.id, { status: 'scheduled', mailchimpId: c.mailchimpId ?? `c-${Math.random().toString(16).slice(2, 12)}` });
      demo(t('cp.plan.done', { when: when(c.sendAt) }));
    });

  return (
    <div className="cp-comp-grid">
      <div className="cp-comp-main">
        <Card eyebrow={t('cp.comp.envelopeEyebrow')} title={t('cp.comp.envelopeTitle')}>
          <fieldset className="cp-fieldset" disabled={locked}>
            <div className="pk-form">
              <Field label={t('cp.comp.subject')} wide hint={!c.subject.trim() ? t('cp.check.subject') : undefined}>
                <input className="pk-input" lang="nl" dir="ltr" value={c.subject} aria-invalid={!c.subject.trim()} onChange={(e) => update(c.id, { subject: e.target.value })} />
              </Field>
              <Field label={t('cp.comp.preview')} wide hint={t('cp.comp.previewHint')}>
                <input className="pk-input" lang="nl" dir="ltr" value={c.preview} onChange={(e) => update(c.id, { preview: e.target.value })} />
              </Field>
              <Field label={t('cp.comp.from')} hint={t('cp.comp.replyTo', { email: c.replyTo })}>
                <select className="pk-input" value={c.fromName} onChange={(e) => update(c.id, { fromName: e.target.value })}>
                  {[...new Set([c.fromName, prefs.fromName, ...SENDERS])].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('cp.comp.segment')} hint={tag ? t('cp.comp.segmentHintEmail', { tag }) : t('cp.comp.segmentHintAll')}>
                <SegmentSelect campaign={c} disabled={locked} />
              </Field>
              <When campaign={c} disabled={locked} />
            </div>
          </fieldset>
        </Card>

        <Card
          eyebrow={t('cp.comp.contentEyebrow')}
          title={t('cp.comp.contentTitle')}
          help={t('cp.comp.contentHelp')}
          actions={
            locked ? null : (
              <button className="btn btn-ghost btn-small" onClick={insertName} title={t('cp.comp.mergeHint')}>
                <PkIcon name="user" size={14} />
                {t('cp.comp.insertName', { tag: FNAME })}
              </button>
            )
          }
        >
          <fieldset className="cp-fieldset" disabled={locked}>
            <ol className="cp-blocks">
              {c.blocks.map((b, i) => (
                <li key={b.id} className={`cp-block cp-block--${b.kind}`}>
                  <div className="cp-block-head">
                    <span>
                      <PkIcon name={KIND[b.kind].icon} size={14} />
                      {t(KIND[b.kind].key)}
                    </span>
                    {locked ? null : (
                      <span className="cp-block-tools">
                        <button type="button" className="icon-button small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('cp.block.up')}>
                          <PkIcon name="up" size={15} />
                        </button>
                        <button type="button" className="icon-button small" disabled={i === c.blocks.length - 1} onClick={() => move(i, 1)} aria-label={t('cp.block.down')}>
                          <PkIcon name="down" size={15} />
                        </button>
                        <button type="button" className="icon-button small" onClick={() => setBlocks(c.blocks.filter((x) => x.id !== b.id))} aria-label={t('cp.block.delete')}>
                          <PkIcon name="trash" size={15} />
                        </button>
                      </span>
                    )}
                  </div>
                  <BlockFields block={b} onPatch={(p) => patch(b.id, p)} onFocus={focus} campaign={c} />
                </li>
              ))}
            </ol>
            {locked ? null : (
              <div className="pk-row cp-add">
                {KINDS.map((k) => (
                  <button key={k.kind} type="button" className="btn btn-ghost btn-small" onClick={() => setBlocks([...c.blocks, newBlock(k.kind)])}>
                    <PkIcon name="plus" size={14} />
                    {t(k.key)}
                  </button>
                ))}
              </div>
            )}
          </fieldset>
        </Card>

        <Comments campaign={c} />

        {c.status !== 'sent' ? (
          <Card className="cp-late" eyebrow={t('cp.comp.sendEyebrow')} title={t('cp.comp.sendTitle')} help={t('cp.comp.sendHelp')}>
            <div className="cp-test">
              <Field label={t('cp.comp.testTo')} hint={t('cp.comp.testHint')}>
                <input className="pk-input" type="email" dir="ltr" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              </Field>
              <button className="btn btn-ghost" disabled={!testTo.includes('@')} onClick={() => demo(t('cp.comp.testSent', { email: testTo }))}>
                <PkIcon name="mail" size={15} />
                {t('cp.comp.sendTest')}
              </button>
            </div>
            <ul className="cp-checks">
              {problems.map((k) => (
                <li key={k} className="is-error">
                  <PkIcon name="warning" size={14} />
                  {t(k)}
                </li>
              ))}
              {warnings.map((k) => (
                <li key={k} className="is-warn">
                  <PkIcon name="info" size={14} />
                  {t(k)}
                </li>
              ))}
              {!problems.length ? (
                <li className="is-ok">
                  <PkIcon name="check" size={14} />
                  {t('cp.check.ready', { n: num(reach), segment: t(segmentKey(c.segment)), when: when(c.sendAt) })}
                </li>
              ) : null}
            </ul>
            {job ? <JobSteps job={job} labels={PLAN_STEPS.map((k) => t(k, { tag: t(segmentKey(c.segment)), when: when(c.sendAt) }))} /> : null}
            <Actions campaign={c} canPlan={!problems.length && !job} onPlan={plan} busy={Boolean(job)} />
          </Card>
        ) : null}
      </div>

      <aside className="cp-comp-side">
        <div className="cp-preview-sticky">
          <div className="cp-preview-bar">
            <Seg
              label={t('cp.comp.device')}
              value={device}
              onChange={setDevice}
              options={[
                { value: 'desktop', label: t('cp.comp.desktop'), icon: 'grid' },
                { value: 'phone', label: t('cp.comp.phone'), icon: 'phone' },
              ]}
            />
            <Check checked={fill} onChange={setFill} label={t('cp.comp.fillName', { name: 'Anna' })} />
          </div>
          <MailPreview campaign={c} device={device} fill={fill} />
          <p className="pk-small pk-muted cp-note">
            <PkIcon name="link" size={14} />
            <span>
              {t('cp.comp.utmNote')} <span className="pk-mono cp-utm">?{utmQuery('email', c.utm)}</span>
            </span>
          </p>
        </div>
      </aside>
    </div>
  );
}

/** The status buttons: to review, back to concept, plan in Mailchimp, take the planning back. */
function Actions({ campaign: c, canPlan, onPlan, busy }: { campaign: Campaign; canPlan: boolean; onPlan: () => void; busy: boolean }) {
  const { t } = useI18n();
  const { update, demo } = useCp();
  return (
    <div className="cp-actions-row">
      {c.status === 'concept' ? (
        <>
          <button
            className="btn btn-primary"
            onClick={() => {
              update(c.id, { status: 'review' });
              demo(t('cp.comp.toReviewToast'));
            }}
          >
            <PkIcon name="eye" size={15} />
            {t('cp.comp.toReview')}
          </button>
          <button className="btn btn-ghost" disabled title={t('cp.comp.planFirstReview')}>
            <PkIcon name="clock" size={15} />
            {t('cp.comp.plan')}
          </button>
          <small className="pk-muted">{t('cp.comp.planFirstReview')}</small>
        </>
      ) : null}
      {c.status === 'review' ? (
        <>
          <button className="btn btn-ghost" disabled={busy} onClick={() => update(c.id, { status: 'concept' })}>
            <PkIcon name="undo" size={15} />
            {t('cp.comp.toConcept')}
          </button>
          <button className="btn btn-primary" disabled={!canPlan} onClick={onPlan}>
            <PkIcon name="clock" size={15} />
            {t('cp.comp.plan')}
          </button>
          <Chip tone="outline">{t('cp.comp.simulated')}</Chip>
        </>
      ) : null}
      {c.status === 'scheduled' ? (
        <>
          <Chip tone="brand" icon="clock">
            {t('cp.comp.scheduledIn')}
          </Chip>
          <button
            className="btn btn-ghost"
            onClick={() => {
              update(c.id, { status: 'concept' });
              demo(t('cp.comp.unscheduledToast'));
            }}
          >
            <PkIcon name="undo" size={15} />
            {t('cp.comp.unschedule')}
          </button>
        </>
      ) : null}
    </div>
  );
}

function BlockFields({
  block: b,
  onPatch,
  onFocus,
  campaign: c,
}: {
  block: Block;
  onPatch: (p: Partial<Block>) => void;
  onFocus: (id: string, field: 'text' | 'title' | 'extra') => (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => void;
  campaign: Campaign;
}) {
  const { t } = useI18n();
  const { demo } = useCp();
  const nl = { lang: 'nl', dir: 'ltr' } as const;
  switch (b.kind) {
    case 'heading':
      return (
        <div className="cp-block-row">
          <input className="pk-input cp-grow" {...nl} value={b.text} placeholder={t('cp.block.headingPh')} aria-label={t('cp.block.heading')} onFocus={onFocus(b.id, 'text')} onChange={(e) => onPatch({ text: e.target.value })} />
          <Seg
            label={t('cp.block.size')}
            value={b.size ?? 'large'}
            onChange={(size) => onPatch({ size })}
            options={[
              { value: 'large', label: t('cp.block.large') },
              { value: 'small', label: t('cp.block.small') },
            ]}
          />
        </div>
      );
    case 'text':
      return <textarea className="pk-input" {...nl} rows={Math.min(10, Math.max(3, Math.ceil(b.text.length / 55) + 1))} value={b.text} aria-label={t('cp.block.text')} onFocus={onFocus(b.id, 'text')} onChange={(e) => onPatch({ text: e.target.value })} />;
    case 'offer': {
      const prices = b.prices ?? [];
      const setPrice = (i: number, p: Partial<PriceLine>) => onPatch({ prices: prices.map((x, j) => (j === i ? { ...x, ...p } : x)) });
      return (
        <div className="pk-stack cp-offer-fields">
          <input className="pk-input" {...nl} value={b.title ?? ''} placeholder={t('cp.block.offerTitle')} aria-label={t('cp.block.offerTitle')} onFocus={onFocus(b.id, 'title')} onChange={(e) => onPatch({ title: e.target.value })} />
          <textarea className="pk-input" {...nl} rows={2} value={b.text} placeholder={t('cp.block.offerText')} aria-label={t('cp.block.offerText')} onFocus={onFocus(b.id, 'text')} onChange={(e) => onPatch({ text: e.target.value })} />
          {prices.map((p, i) => (
            <div key={i} className="cp-price-row">
              <input className="pk-input" {...nl} value={p.label} placeholder={t('cp.block.priceLabel')} aria-label={t('cp.block.priceLabel')} onChange={(e) => setPrice(i, { label: e.target.value })} />
              <input className="pk-input cp-price" {...nl} value={p.was} placeholder={t('cp.block.was')} aria-label={t('cp.block.was')} onChange={(e) => setPrice(i, { was: e.target.value })} />
              <span className="cp-arrow" aria-hidden="true">→</span>
              <input className="pk-input cp-price" {...nl} value={p.now} placeholder={t('cp.block.now')} aria-label={t('cp.block.now')} onChange={(e) => setPrice(i, { now: e.target.value })} />
              <button type="button" className="icon-button small" onClick={() => onPatch({ prices: prices.filter((_, j) => j !== i) })} aria-label={t('cp.block.removePrice')}>
                <PkIcon name="close" size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="cp-link cp-link--small" onClick={() => onPatch({ prices: [...prices, { label: '', was: '', now: '' }] })}>
            <PkIcon name="plus" size={13} />
            {t('cp.block.addPrice')}
          </button>
          <input className="pk-input" {...nl} value={b.extra ?? ''} placeholder={t('cp.block.extra')} aria-label={t('cp.block.extra')} onFocus={onFocus(b.id, 'extra')} onChange={(e) => onPatch({ extra: e.target.value })} />
        </div>
      );
    }
    case 'button':
      return (
        <div className="cp-block-row cp-block-row--wrap">
          <input className="pk-input cp-grow" {...nl} value={b.text} placeholder={t('cp.block.buttonLabel')} aria-label={t('cp.block.buttonLabel')} onFocus={onFocus(b.id, 'text')} onChange={(e) => onPatch({ text: e.target.value })} />
          <input className="pk-input cp-grow pk-mono" dir="ltr" value={b.url ?? ''} placeholder="https://" aria-label={t('cp.block.url')} onChange={(e) => onPatch({ url: e.target.value })} />
          <small className="pk-muted cp-full pk-mono cp-utm">{`${b.url || 'https://pureclinics.nl'}?${utmQuery('email', c.utm, b.id)}`}</small>
        </div>
      );
    case 'image':
      return (
        <div className="cp-block-row cp-block-row--wrap">
          <span className="cp-tile cp-tile--small" aria-hidden="true">
            <PkIcon name="camera" size={18} />
          </span>
          <input className="pk-input cp-grow" {...nl} value={b.alt ?? ''} placeholder={t('cp.block.alt')} aria-label={t('cp.block.alt')} onChange={(e) => onPatch({ alt: e.target.value })} />
          <button type="button" className="btn btn-ghost btn-small" onClick={() => demo(t('cp.block.pickToast'))}>
            <PkIcon name="upload" size={14} />
            {t('cp.block.pick')}
          </button>
        </div>
      );
  }
}

/** The mail as a client would see it: Dutch, left to right, in every panel language. */
function MailPreview({ campaign: c, device, fill }: { campaign: Campaign; device: 'desktop' | 'phone'; fill: boolean }) {
  const { t } = useI18n();
  const name = (s: string) => (fill ? s.split(FNAME).join('Anna') : s);
  const lines = (s: string): ReactNode[] =>
    name(s)
      .split('\n\n')
      .map((para, i) => (
        <p key={i}>
          {para.split('\n').map((line, j) => (
            <span key={j}>
              {j ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      ));
  return (
    <div className={`cp-mail-frame cp-mail-frame--${device}`} aria-label={t('cp.comp.previewLabel')}>
      <div className="cp-mail" lang="nl" dir="ltr">
        <div className="cp-mail-inbox">
          <span className="cp-mail-from">
            <span className="cp-initial" aria-hidden="true">
              PC
            </span>
            <span>
              <b>{c.fromName}</b> <span className="cp-mail-addr">&lt;{c.replyTo}&gt;</span>
            </span>
          </span>
          <strong>{name(c.subject) || '—'}</strong>
          {c.preview ? <span className="cp-mail-pre">{name(c.preview)}</span> : null}
        </div>
        <div className="cp-mail-body">
          <span className="cp-mail-mark">
            <b>PURE</b>CLINICS
          </span>
          {c.blocks.map((b) => {
            switch (b.kind) {
              case 'heading':
                return b.text ? (
                  <h3 key={b.id} className={`cp-mail-h cp-mail-h--${b.size ?? 'large'}`}>
                    {name(b.text)}
                  </h3>
                ) : null;
              case 'text':
                return (
                  <div key={b.id} className="cp-mail-text">
                    {lines(b.text)}
                  </div>
                );
              case 'offer':
                return (
                  <div key={b.id} className="cp-mail-offer">
                    {b.title ? <strong className="cp-mail-offer-title">{name(b.title)}</strong> : null}
                    {b.text ? <p>{name(b.text)}</p> : null}
                    {(b.prices ?? []).filter((p) => p.label || p.was || p.now).map((p, i) => (
                      <p key={i} className="cp-mail-price">
                        {p.label ? <span>{p.label} </span> : null}
                        {p.was ? (
                          <>
                            <s>{p.was}</s> <span aria-hidden="true">→</span>{' '}
                          </>
                        ) : null}
                        <b>{p.now}</b>
                      </p>
                    ))}
                    {b.extra ? <p className="cp-mail-extra">{name(b.extra)}</p> : null}
                  </div>
                );
              case 'button':
                return b.text ? (
                  <span key={b.id} className="cp-mail-button">
                    {name(b.text)}
                  </span>
                ) : null;
              case 'image':
                return (
                  <span key={b.id} className="cp-tile" role="img" aria-label={b.alt || t('cp.block.image')}>
                    <PkIcon name="camera" size={22} />
                    {b.alt ? <small>{b.alt}</small> : null}
                  </span>
                );
            }
          })}
        </div>
        <div className="cp-mail-foot">
          Je ontvangt deze e-mail omdat je je hebt aangemeld voor de nieuwsbrief van Pure Clinics.
          <br />
          <u>Afmelden</u> · <u>Voorkeuren aanpassen</u>
          <br />
          {['Pure Clinics', ...LOCATIONS.map((l) => `${l.address.split(',')[0]}, ${l.city}`)].join(' · ')}
        </div>
      </div>
    </div>
  );
}
