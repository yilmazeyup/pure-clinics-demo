import { LOCATIONS, TREATMENTS, type TreatmentId } from '@pure-clinics/shared';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { useI18n } from '../../../i18n';
import { rng } from '../../../data/random';
import { usePraktijk } from '../../context';
import { CAME_VIA, CONDITIONS, practiceClients, type CameVia, type ConditionId, type PracticeClient } from '../../data/core';
import { seedNewsletters, type Block, type BlockKind, type Newsletter, type NewsTemplate } from '../../data/messages';
import { PkIcon } from '../../icons';
import { Bar, Card, Check, Chip, Field, Kv, Modal, Steps, TableWrap } from '../../kit';
import { fill, insertAt, TokenChips, TOKEN_ARGS, type Token } from './template';

// The newsletter in three steps, as clinics know it: choose the audience, make the letter, send it. Only clients with an
// e-mail address and the newsletter tick on their file are ever counted.

type Status = 'all' | 'open' | 'active' | 'closed';
type Size = 'all' | 10 | 100 | 200 | 500 | 1000;

const NEWS_TOKENS: Token[] = ['voornaam', 'voorletters', 'tussenvoegsel', 'achternaam'];
/** The sample the preview fills in, the same example SkinAdmin's own help uses. */
const SAMPLE: Partial<Record<Token, string>> = { voornaam: 'Marieke', voorletters: 'M.', tussenvoegsel: 'van der', achternaam: 'Berg' };

const DOCS = ['pk.berichten.news.doc1', 'pk.berichten.news.doc2'] as const;

let blockId = 0;
const newBlock = (kind: BlockKind, text = ''): Block => ({ id: `blk-${++blockId}`, kind, text, image: null, file: null });

function matches(c: PracticeClient, status: Status): boolean {
  if (status === 'open') return !c.episodes.some((e) => e.closed);
  if (status === 'active') return c.episodes.some((e) => !e.closed && e.sessions.done > 0);
  if (status === 'closed') return c.episodes.every((e) => e.closed);
  return c.episodes.length > 0;
}

/** A searchable checklist with "only selected", "select all results", "clear" and the chosen ones as chips. */
function Picker<T extends string>({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: { id: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(false);
  const shown = items.filter((i) => (!only || selected.includes(i.id)) && i.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="pk-me-picker">
      <span className="pk-field-label">{label}</span>
      {selected.length ? (
        <div className="pk-me-chips">
          {selected.map((id) => (
            <button key={id} className="pk-me-chip" onClick={() => onChange(selected.filter((s) => s !== id))} aria-label={t('pk.berichten.news.remove', { name: items.find((i) => i.id === id)?.label ?? id })}>
              {items.find((i) => i.id === id)?.label}
              <PkIcon name="close" size={12} />
            </button>
          ))}
        </div>
      ) : (
        <small className="pk-field-hint">{t('pk.berichten.news.allIfNone')}</small>
      )}
      <div className="pk-search">
        <PkIcon name="search" size={15} />
        <input className="pk-input" value={q} placeholder={t('pk.berichten.news.filterList')} aria-label={`${label}: ${t('pk.berichten.news.filterList')}`} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pk-me-picker-tools">
        <Check checked={only} onChange={setOnly} label={t('pk.berichten.news.onlySelected')} />
        <button className="pk-me-link" onClick={() => onChange([...new Set([...selected, ...shown.map((i) => i.id)])])} disabled={!shown.length}>
          {t('pk.berichten.news.selectAll', { n: shown.length })}
        </button>
        <button className="pk-me-link" onClick={() => onChange([])} disabled={!selected.length}>
          {t('pk.berichten.news.clear')}
        </button>
      </div>
      <div className="pk-me-picker-list">
        {shown.map((i) => (
          <Check
            key={i.id}
            checked={selected.includes(i.id)}
            onChange={(on) => onChange(on ? [...selected, i.id] : selected.filter((s) => s !== i.id))}
            label={i.label}
          />
        ))}
      </div>
    </div>
  );
}

export function Newsletter({ jump }: { jump: { feature: string; at: number } | null }) {
  const i18n = useI18n();
  const { t, text, num, pct, dayMonth } = i18n;
  const { today, now, demo } = usePraktijk();
  const clients = useMemo(() => practiceClients(today), [today]);
  const consenting = useMemo(() => clients.filter((c) => c.flags.newsletter && c.email).length, [clients]);

  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status>('all');
  const [via, setVia] = useState<CameVia[]>([]);
  const [size, setSize] = useState<Size>('all');
  const [conditions, setConditions] = useState<ConditionId[]>([]);
  const [treatments, setTreatments] = useState<TreatmentId[]>([]);
  const [showRecipients, setShowRecipients] = useState(false);

  const [subject, setSubject] = useState(() => t('pk.berichten.news.defaultSubject'));
  const [preview, setPreview] = useState(() => t('pk.berichten.news.defaultPreview'));
  const [blocks, setBlocks] = useState<Block[]>(() => [
    newBlock('text', t('pk.berichten.news.defaultBody', TOKEN_ARGS)),
    newBlock('image'),
    newBlock('text', t('pk.berichten.news.defaultBody2')),
  ]);
  const [templates, setTemplates] = useState<NewsTemplate[]>(() => [
    {
      id: 'tpl-laser',
      name: null,
      nameKey: 'pk.berichten.news.tplLaser',
      subject: t('pk.berichten.news.defaultSubject'),
      preview: t('pk.berichten.news.defaultPreview'),
      blocks: [newBlock('text', t('pk.berichten.news.defaultBody', TOKEN_ARGS)), newBlock('image'), newBlock('text', t('pk.berichten.news.defaultBody2'))],
    },
    {
      id: 'tpl-season',
      name: null,
      nameKey: 'pk.berichten.news.tplSeason',
      subject: t('pk.berichten.news.seed1'),
      preview: '',
      blocks: [newBlock('text', t('pk.berichten.news.seasonBody', TOKEN_ARGS)), newBlock('file'), newBlock('text', t('pk.berichten.news.defaultBody2'))],
    },
  ]);
  const [templateId, setTemplateId] = useState('tpl-laser');
  const [naming, setNaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const lastArea = useRef<string | null>(null);

  const [testTo, setTestTo] = useState('info@pureclinics.nl');
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [log, setLog] = useState<Newsletter[]>(() => seedNewsletters(today).map((n, i) => ({ ...n, recipients: Math.max(1, consenting - 9 - i * 17) })));

  // A jump from the feature overview opens the step where the feature lives.
  useEffect(() => {
    if (!jump) return;
    if (jump.feature === 'q.newsFilters' || jump.feature === 'q.newsConsent') setStep(0);
    if (jump.feature === 'q.newsContent') setStep(1);
    if (jump.feature === 'q.newsSend') setStep(2);
  }, [jump?.at]);

  const selection = useMemo(() => {
    let list = clients.filter(
      (c) =>
        matches(c, status) &&
        (!via.length || via.includes(c.cameVia)) &&
        (!conditions.length || c.episodes.some((e) => conditions.includes(e.condition))) &&
        (!treatments.length || c.episodes.some((e) => treatments.includes(e.treatment))),
    );
    if (size !== 'all') list = [...list].sort((a, b) => b.since.getTime() - a.since.getTime()).slice(0, size);
    return list;
  }, [clients, status, via, size, conditions, treatments]);
  const recipients = selection.filter((c) => c.flags.newsletter && c.email);

  // Sending: a few recipients per tick, then the letter joins the overview.
  useEffect(() => {
    if (!sending) return;
    if (sending.done >= sending.total) {
      setLog((l) => [{ id: `n-${Date.now()}`, subject, at: now, recipients: sending.total, opened: null, draft: false }, ...l]);
      demo(t('pk.berichten.news.sent', { n: sending.total }));
      return;
    }
    const id = window.setTimeout(() => setSending({ ...sending, done: Math.min(sending.total, sending.done + Math.max(1, Math.ceil(sending.total / 14))) }), 140);
    return () => window.clearTimeout(id);
  }, [sending]);

  const unsubs = useMemo(() => {
    const r = rng('pk-unsubs');
    return clients
      .filter((c) => !c.flags.newsletter)
      .map((c) => ({ c, k: r() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, 5)
      .map(({ c }, i) => ({ client: c, at: new Date(today.getTime() - (2 + i * 4) * 86400000), after: log.filter((n) => !n.draft)[i < 3 ? 0 : 1] }));
  }, [clients, today]);

  const insertToken = (value: string) => {
    const id = lastArea.current ?? blocks.find((b) => b.kind === 'text')?.id;
    const block = blocks.find((b) => b.id === id);
    if (!block) return;
    const next = insertAt(areas.current[block.id] ?? null, block.text, value);
    setBlocks(blocks.map((b) => (b.id === block.id ? { ...b, text: next } : b)));
  };

  const update = (id: string, patch: Partial<Block>) => setBlocks((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const pickFile = (block: Block, kind: 'image' | 'file') => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const limit = kind === 'image' ? 3 : 5;
    if (file.size > limit * 1024 * 1024) {
      setError(t(kind === 'image' ? 'pk.berichten.news.imageTooBig' : 'pk.berichten.news.fileTooBig'));
      return;
    }
    setError(null);
    if (kind === 'image') update(block.id, { image: URL.createObjectURL(file) });
    else update(block.id, { file: file.name });
  };

  const useTemplate = () => {
    const tpl = templates.find((x) => x.id === templateId);
    if (!tpl) return;
    setSubject(tpl.subject);
    setPreview(tpl.preview);
    setBlocks(tpl.blocks.map((b) => ({ ...b, id: `blk-${++blockId}` })));
  };

  const saveTemplate = () => {
    if (!naming?.trim()) return;
    const tpl: NewsTemplate = { id: `tpl-${Date.now()}`, name: naming.trim(), subject, preview, blocks };
    setTemplates([...templates, tpl]);
    setTemplateId(tpl.id);
    demo(t('pk.berichten.news.templateSaved', { name: tpl.name! }));
    setNaming(null);
  };

  const canNext = step === 0 ? recipients.length > 0 : step === 1 ? subject.trim().length > 0 : false;
  const docLabel = (file: string | null) => (file && (DOCS as readonly string[]).includes(file) ? t(file as (typeof DOCS)[number]) : file);
  const sendingNow = sending !== null && sending.done < sending.total;
  const sentDone = sending !== null && sending.done >= sending.total;

  return (
    <>
      <Card
        eyebrow={t('pk.berichten.news.eyebrow')}
        title={t('pk.berichten.news.title')}
        actions={
          <span className="pk-me-count" data-feature="q.newsConsent" title={t('pk.berichten.news.consent')}>
            <PkIcon name="users" size={15} />
            {t('pk.berichten.news.recipientsChip', { n: num(recipients.length) })}
          </span>
        }
      >
        <Steps
          steps={[t('pk.berichten.news.step1'), t('pk.berichten.news.step2'), t('pk.berichten.news.step3')]}
          current={step}
          onStep={(i) => (i <= step || (i === 1 && recipients.length) || (i === 2 && recipients.length && subject.trim()) ? setStep(i) : undefined)}
        />

        {step === 0 ? (
          <div className="pk-me-step" data-feature="q.newsFilters">
            <div className="pk-me-audience">
              <div className="pk-stack">
                <Field label={t('pk.berichten.news.status')}>
                  <select className="pk-input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                    <option value="all">{t('pk.berichten.news.statusAll')}</option>
                    <option value="open">{t('pk.berichten.news.statusOpen')}</option>
                    <option value="active">{t('pk.berichten.news.statusActive')}</option>
                    <option value="closed">{t('pk.berichten.news.statusClosed')}</option>
                  </select>
                </Field>
                <Field label={t('pk.berichten.news.size')}>
                  <select className="pk-input" value={String(size)} onChange={(e) => setSize(e.target.value === 'all' ? 'all' : (Number(e.target.value) as Size))}>
                    <option value="all">{t('pk.berichten.news.sizeAll')}</option>
                    {[10, 100, 200, 500, 1000].map((n) => (
                      <option key={n} value={n}>
                        {t('pk.berichten.news.sizeLast', { n: num(n) })}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="pk-me-picker">
                  <span className="pk-field-label">{t('pk.berichten.news.via')}</span>
                  <small className="pk-field-hint">{t('pk.berichten.news.viaAll')}</small>
                  <div className="pk-me-picker-list pk-me-picker-list--open">
                    {CAME_VIA.map((v) => (
                      <Check key={v} checked={via.includes(v)} onChange={(on) => setVia(on ? [...via, v] : via.filter((x) => x !== v))} label={t(`pk.via.${v}`)} />
                    ))}
                  </div>
                </div>
              </div>
              <Picker
                label={t('pk.berichten.news.conditions')}
                items={CONDITIONS.map((c) => ({ id: c.id, label: t(c.label) }))}
                selected={conditions}
                onChange={setConditions}
              />
              <Picker
                label={t('pk.berichten.news.treatments')}
                items={TREATMENTS.map((tr) => ({ id: tr.id, label: text(tr.name) }))}
                selected={treatments}
                onChange={setTreatments}
              />
            </div>
            <div className="pk-me-total">
              <div>
                <span className="eyebrow">{t('pk.berichten.news.recipients')}</span>
                <strong className="pk-num">{num(recipients.length)}</strong>
                <small>{t('pk.berichten.news.consent')}</small>
                {selection.length > recipients.length ? (
                  <small className="pk-me-warn">{t('pk.berichten.news.consentNote', { n: num(selection.length - recipients.length) })}</small>
                ) : null}
              </div>
              <button className="btn btn-ghost" disabled={!recipients.length} onClick={() => setShowRecipients(true)}>
                <PkIcon name="eye" size={15} />
                {t('pk.berichten.news.viewRecipients')}
              </button>
            </div>
            {!recipients.length ? <p className="pk-me-error">{t('pk.berichten.news.atLeastOne')}</p> : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="pk-me-step pk-me-compose" data-feature="q.newsContent">
            <div className="pk-stack">
              <div className="pk-form">
                <Field label={t('pk.berichten.subject')} hint={!subject.trim() ? t('pk.berichten.news.subjectRequired') : undefined}>
                  <input className="pk-input" value={subject} aria-invalid={!subject.trim()} required onChange={(e) => setSubject(e.target.value)} />
                </Field>
                <Field label={t('pk.berichten.news.previewText')} hint={t('pk.berichten.news.previewTextHint')}>
                  <input className="pk-input" value={preview} onChange={(e) => setPreview(e.target.value)} />
                </Field>
              </div>
              <div className="pk-me-template-row">
                <Field label={t('pk.berichten.news.template')}>
                  <select className="pk-input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name ?? (tpl.nameKey ? t(tpl.nameKey) : tpl.id)}
                      </option>
                    ))}
                  </select>
                </Field>
                <button className="btn btn-ghost btn-small" onClick={useTemplate}>
                  {t('pk.berichten.news.useTemplate')}
                </button>
                {naming === null ? (
                  <button className="btn btn-ghost btn-small" onClick={() => setNaming('')}>
                    <PkIcon name="layers" size={14} />
                    {t('pk.berichten.news.saveTemplate')}
                  </button>
                ) : (
                  <span className="pk-row">
                    <input
                      className="pk-input pk-me-name"
                      autoFocus
                      value={naming}
                      placeholder={t('pk.berichten.news.templateName')}
                      aria-label={t('pk.berichten.news.templateName')}
                      onChange={(e) => setNaming(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveTemplate()}
                    />
                    <button className="btn btn-primary btn-small" disabled={!naming.trim()} onClick={saveTemplate}>
                      {t('pk.common.save')}
                    </button>
                  </span>
                )}
              </div>
              <TokenChips tokens={NEWS_TOKENS} onInsert={insertToken} />
              {error ? <p className="pk-me-error">{error}</p> : null}
              <ol className="pk-me-blocks">
                {blocks.map((b) => (
                  <li key={b.id} className="pk-me-block">
                    <div className="pk-me-block-head">
                      <span>
                        <PkIcon name={b.kind === 'text' ? 'edit' : b.kind === 'image' ? 'camera' : 'file'} size={14} />
                        {t(b.kind === 'text' ? 'pk.berichten.news.blockText' : b.kind === 'image' ? 'pk.berichten.news.blockImage' : 'pk.berichten.news.blockFile')}
                      </span>
                      <button className="icon-button small" aria-label={t('pk.berichten.news.deleteBlock')} onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))}>
                        <PkIcon name="trash" size={15} />
                      </button>
                    </div>
                    {b.kind === 'text' ? (
                      <textarea
                        ref={(el) => {
                          areas.current[b.id] = el;
                        }}
                        className="pk-input"
                        rows={4}
                        value={b.text}
                        aria-label={t('pk.berichten.news.blockText')}
                        onFocus={() => (lastArea.current = b.id)}
                        onChange={(e) => update(b.id, { text: e.target.value })}
                      />
                    ) : b.kind === 'image' ? (
                      <div className="pk-me-block-file">
                        {b.image ? <img src={b.image} alt="" /> : <span className="pk-me-art" aria-hidden="true" />}
                        <label className="btn btn-ghost btn-small pk-me-upload">
                          <PkIcon name="upload" size={14} />
                          {t('pk.berichten.news.uploadFile')}
                          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={pickFile(b, 'image')} />
                        </label>
                        <small className="pk-field-hint">{t('pk.berichten.news.imageHint')}</small>
                      </div>
                    ) : (
                      <div className="pk-me-block-file">
                        <select className="pk-input" value={b.file && (DOCS as readonly string[]).includes(b.file) ? b.file : ''} aria-label={t('pk.berichten.news.existingDoc')} onChange={(e) => update(b.id, { file: e.target.value || null })}>
                          <option value="">{t('pk.berichten.news.existingDoc')}</option>
                          {DOCS.map((d) => (
                            <option key={d} value={d}>
                              {t(d)}
                            </option>
                          ))}
                        </select>
                        <label className="btn btn-ghost btn-small pk-me-upload">
                          <PkIcon name="upload" size={14} />
                          {t('pk.berichten.news.uploadFile')}
                          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={pickFile(b, 'file')} />
                        </label>
                        <small className="pk-field-hint">{b.file ? docLabel(b.file) : t('pk.berichten.news.fileHint')}</small>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              <div className="pk-row">
                <button className="btn btn-ghost btn-small" onClick={() => setBlocks([...blocks, newBlock('text')])}>
                  <PkIcon name="plus" size={14} />
                  {t('pk.berichten.news.addText')}
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => setBlocks([...blocks, newBlock('image')])}>
                  <PkIcon name="plus" size={14} />
                  {t('pk.berichten.news.addImage')}
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => setBlocks([...blocks, newBlock('file')])}>
                  <PkIcon name="plus" size={14} />
                  {t('pk.berichten.news.addFile')}
                </button>
              </div>
            </div>

            <div className="pk-me-preview pk-me-preview--sticky">
              <span className="eyebrow">{t('pk.berichten.previewWith', { name: 'Marieke van der Berg' })}</span>
              <div className="pk-me-mail">
                <div className="pk-me-mail-head">
                  <span>
                    {t('pk.berichten.from')} <b>Pure Clinics</b>
                  </span>
                  <strong>{subject || '—'}</strong>
                  {preview ? <span>{preview}</span> : null}
                </div>
                <div className="pk-me-mail-body">
                  <span className="pk-me-mail-mark">
                    <b>PURE</b>CLINICS
                  </span>
                  {blocks.map((b) =>
                    b.kind === 'text' ? (
                      <div key={b.id}>
                        {fill(b.text, SAMPLE)
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
                          ))}
                      </div>
                    ) : b.kind === 'image' ? (
                      b.image ? <img key={b.id} className="pk-me-mail-img" src={b.image} alt="" /> : <span key={b.id} className="pk-me-art" aria-hidden="true" />
                    ) : (
                      <span key={b.id} className="pk-me-attach">
                        <PkIcon name="file" size={14} />
                        {docLabel(b.file) ?? t('pk.berichten.news.noFile')}
                      </span>
                    ),
                  )}
                </div>
                <div className="pk-me-mail-foot">
                  {t('pk.berichten.news.footer')} <a href="#praktijk/berichten" onClick={(e) => e.preventDefault()}>{t('pk.berichten.news.unsubscribe')}</a>
                  <br />
                  {['Pure Clinics', ...LOCATIONS.map((l) => `${l.address.split(',')[0]}, ${l.city}`)].join(' · ')}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="pk-me-step pk-me-send" data-feature="q.newsSend">
            <div className="pk-stack">
              <span className="eyebrow">{t('pk.berichten.news.summary')}</span>
              <Kv
                rows={[
                  [t('pk.berichten.subject'), subject],
                  [t('pk.berichten.news.recipients'), num(recipients.length)],
                  [t('pk.berichten.news.blockText'), num(blocks.filter((b) => b.kind === 'text').length)],
                  [t('pk.berichten.news.blockFile'), blocks.filter((b) => b.kind === 'file').map((b) => docLabel(b.file) ?? '—').join(', ') || '—'],
                ]}
              />
            </div>
            <div className="pk-stack">
              <Field label={t('pk.berichten.news.testTo')}>
                <span className="pk-row pk-me-test">
                  <input className="pk-input" type="email" dir="ltr" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  <button className="btn btn-ghost" onClick={() => demo(t('pk.berichten.news.testSent', { email: testTo }))}>
                    <PkIcon name="mail" size={15} />
                    {t('pk.berichten.news.sendTest')}
                  </button>
                </span>
              </Field>
              <div className="pk-row">
                <button
                  className="btn btn-ghost"
                  disabled={sendingNow}
                  onClick={() => {
                    setLog([{ id: `d-${Date.now()}`, subject, at: now, recipients: recipients.length, opened: null, draft: true }, ...log]);
                    demo(t('pk.berichten.news.draftSaved'));
                  }}
                >
                  {t('pk.berichten.news.saveDraft')}
                </button>
                <button className="btn btn-primary" disabled={sendingNow || sentDone || !recipients.length} onClick={() => setSending({ done: 0, total: recipients.length })}>
                  <PkIcon name="send" size={15} />
                  {t('pk.berichten.news.sendNow', { n: num(recipients.length) })}
                </button>
              </div>
              {sending ? (
                <div className="pk-me-progress">
                  <Bar value={sending.done} max={sending.total} tone="now" />
                  <small className="pk-muted">
                    {sendingNow ? t('pk.berichten.news.sending', { n: num(sending.done), total: num(sending.total) }) : t('pk.berichten.news.sent', { n: num(sending.total) })}
                  </small>
                  {sentDone ? (
                    <button
                      className="btn btn-ghost btn-small"
                      onClick={() => {
                        setSending(null);
                        setStep(0);
                      }}
                    >
                      <PkIcon name="plus" size={14} />
                      {t('pk.berichten.news.new')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="pk-me-nav">
          <button className="btn btn-ghost" disabled={step === 0 || sendingNow} onClick={() => setStep(step - 1)}>
            <PkIcon name="chevronStart" size={15} />
            {t('pk.common.previous')}
          </button>
          {step < 2 ? (
            <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {t('pk.common.next')}
              <PkIcon name="chevronEnd" size={15} />
            </button>
          ) : null}
        </div>
      </Card>

      <div className="pk-grid">
        <Card feature="q.newsSend" className="span-8" eyebrow={t('pk.berichten.news.step3')} title={t('pk.berichten.news.overview')}>
          <TableWrap label={t('pk.berichten.news.overview')}>
            <table className="pk-table">
              <thead>
                <tr>
                  <th>{t('pk.common.date')}</th>
                  <th>{t('pk.berichten.news.colSubject')}</th>
                  <th className="end">{t('pk.berichten.news.colRecipients')}</th>
                  <th>{t('pk.berichten.news.colOpened')}</th>
                  <th>{t('pk.common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {log.map((n) => (
                  <tr key={n.id}>
                    <td className="nowrap">{dayMonth(n.at, today)}</td>
                    <td>{n.subject ?? (n.subjectKey ? t(n.subjectKey) : '')}</td>
                    <td className="end">{num(n.recipients)}</td>
                    <td>
                      {n.opened !== null ? (
                        <span className="pk-me-open">
                          <Bar value={n.opened} tone="good" />
                          {pct(n.opened)}
                        </span>
                      ) : (
                        <span className="pk-muted">—</span>
                      )}
                    </td>
                    <td>{n.draft ? <Chip tone="outline">{t('pk.berichten.news.draft')}</Chip> : <Chip tone="good">{t('pk.berichten.news.sentStatus')}</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card feature="q.newsUnsub" className="span-4" eyebrow={t('pk.berichten.news.unsubscribe')} title={t('pk.berichten.news.unsubs')} help={t('pk.berichten.news.unsubsHelp')}>
          <ul className="pk-list">
            {unsubs.map((u) => (
              <li key={u.client.id}>
                <span className="pk-me-unsub">
                  <b>
                    {u.client.first} {u.client.last}
                  </b>
                  <small>{u.after ? t('pk.berichten.news.unsubAfter', { subject: u.after.subject ?? (u.after.subjectKey ? t(u.after.subjectKey) : '') }) : null}</small>
                </span>
                <span className="pk-muted pk-small nowrap">{dayMonth(u.at, today)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Modal open={showRecipients} title={t('pk.berichten.news.recipientsTitle')} onClose={() => setShowRecipients(false)} wide>
        <p className="pk-muted pk-small">{t('pk.berichten.news.consent')}</p>
        <TableWrap label={t('pk.berichten.news.recipientsTitle')}>
          <table className="pk-table">
            <thead>
              <tr>
                <th>{t('pk.common.client')}</th>
                <th>{t('pk.berichten.channel.email')}</th>
                <th>{t('pk.common.location')}</th>
              </tr>
            </thead>
            <tbody>
              {recipients.slice(0, 250).map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.first} {c.last}
                  </td>
                  <td className="pk-mono">{c.email}</td>
                  <td>{c.city}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Modal>
    </>
  );
}
