import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../i18n';
import { usePraktijk } from '../context';
import { memberSince, messageLog, type Channel } from '../data/clients';
import { ageOn, CAME_VIA, cityOf, conditionById, dmy, insurerById, STAFF, type CameVia, type PracticeClient } from '../data/core';
import { PkIcon, type PkIconName } from '../icons';
import { Card, Chip, Field, isolate, Kv, Modal, Stat, TableWrap, Toggle } from '../kit';
import { MergeDialog } from './clients/Merge';
import { NewClientDialog } from './clients/NewClient';
import { TransferDialog } from './clients/Transfer';
import { useClients } from './clients/useClients';
import './Clients.css';

type MatchField = 'name' | 'birth' | 'email' | 'phone' | 'policy' | 'bsn';
const digits = (text: string) => text.replace(/\D+/g, '');

/** Which field a search matches, in the order a receptionist would expect; null when nothing matches. */
function matchOf(c: PracticeClient, query: string): MatchField | null {
  const q = query.trim().toLowerCase();
  if (!q) return 'name';
  if (`${c.first} ${c.last}`.toLowerCase().includes(q) || c.short.toLowerCase().includes(q)) return 'name';
  if (dmy(c.birth).includes(q.replace(/[/.]/g, '-'))) return 'birth';
  if (c.email.toLowerCase().includes(q)) return 'email';
  const d = digits(q);
  if (d.length >= 4 && digits(c.phone).includes(d)) return 'phone';
  if (c.policy && c.policy.toLowerCase().includes(q)) return 'policy';
  if (d.length >= 5 && c.bsn.includes(d)) return 'bsn';
  return null;
}

const FLAG_ICON: Record<keyof PracticeClient['flags'], PkIconName> = { newsletter: 'mail', sms: 'sms', email: 'bell', share: 'link' };
const CHANNEL_ICON: Record<Channel, PkIconName> = { email: 'mail', sms: 'sms', whatsapp: 'whatsapp' };

/** The client register: search, new clients with the COV check, the client card, sent messages, duplicates and transfers. */
export function ClientsScreen() {
  const i18n = useI18n();
  const { t, num, pct } = i18n;
  const { today, go, target } = usePraktijk();
  const { list, pairs, addedIds, add, update, remove, merge, byId, foreign, setForeign } = useClients();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(25);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => list.find((c) => c.member && c.episodes.length > 1 && !STAFF.some((s) => s.name === c.first))?.id ?? list[0]?.id ?? null,
  );
  const [dialog, setDialog] = useState<'new' | 'transfer' | null>(null);
  const [merging, setMerging] = useState<number | null>(null);

  // A jump from elsewhere with a client opens her card here.
  useEffect(() => {
    if (target?.clientId && byId(target.clientId)) setSelectedId(target.clientId);
  }, [target?.at]);

  const results = useMemo(() => {
    const out: { c: PracticeClient; on: MatchField }[] = [];
    for (const c of list) {
      const on = matchOf(c, query);
      if (on) out.push({ c, on });
    }
    return out;
  }, [list, query]);

  const selected = byId(selectedId) ?? null;
  const members = list.filter((c) => c.member).length;
  const insured = list.filter((c) => c.episodes.some((e) => e.billing === 'insurer')).length;

  return (
    <div className="pk-grid">
      <div className="pk-stats span-12">
        <Stat label={t('pk.clienten.stat.total')} value={num(list.length)} sub={t('pk.clienten.stat.totalSub')} />
        <Stat label={t('pk.clienten.stat.members')} value={num(members)} sub={t('pk.clienten.stat.membersSub', { pct: pct(members / Math.max(1, list.length)) })} />
        <Stat label={t('pk.clienten.stat.newsletter')} value={num(list.filter((c) => c.flags.newsletter).length)} sub={t('pk.clienten.stat.newsletterSub')} />
        <Stat label={t('pk.clienten.stat.insured')} value={num(insured)} sub={t('pk.clienten.stat.insuredSub')} />
      </div>

      <Card
        className="span-8"
        eyebrow={t('pk.clienten.search.eyebrow')}
        title={t('pk.clienten.search.title')}
        feature="d.search"
        actions={
          <>
            <button className="btn btn-ghost btn-small" data-feature="d.transfer" onClick={() => setDialog('transfer')}>
              <PkIcon name="swap" size={15} />
              {t('pk.clienten.transfer')}
            </button>
            <button className="btn btn-primary btn-small" data-feature="d.cov d.covFill" onClick={() => setDialog('new')}>
              <PkIcon name="plus" size={15} />
              {t('pk.clienten.new')}
            </button>
          </>
        }
      >
        <div className="pk-cl-searchbar">
          <label className="pk-search">
            <PkIcon name="search" size={16} />
            <input
              className="pk-input"
              type="search"
              value={query}
              aria-label={t('pk.clienten.search.label')}
              placeholder={t('pk.clienten.search.placeholder')}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(25);
              }}
            />
          </label>
          <span className="pk-muted pk-small">{query.trim() ? t('pk.clienten.search.found', { n: results.length }) : t('pk.clienten.search.count', { n: list.length })}</span>
        </div>

        {results.length ? (
          <TableWrap label={t('pk.clienten.search.title')}>
            <table className="pk-table pk-cl-table">
              <thead>
                <tr>
                  <th>{t('pk.clienten.col.name')}</th>
                  <th>{t('pk.clienten.col.birth')}</th>
                  <th>{t('pk.common.insurer')}</th>
                  <th>{t('pk.clienten.col.policy')}</th>
                  <th>{t('pk.common.location')}</th>
                  <th>{t('pk.clienten.col.flags')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.slice(0, limit).map(({ c, on }) => (
                  <tr key={c.id} aria-selected={c.id === selectedId} onClick={() => setSelectedId(c.id)}>
                    <td>
                      <button className="pk-cl-name" onClick={() => setSelectedId(c.id)}>
                        <strong>
                          {c.first} {c.last}
                        </strong>
                        {c.member ? <Chip tone="brand">{t('pk.clienten.member.chip')}</Chip> : null}
                        {addedIds.has(c.id) ? <Chip tone="good">{t('pk.clienten.newBadge')}</Chip> : null}
                      </button>
                      <small className="pk-cl-city">{c.city}</small>
                      {query.trim() && on !== 'name' ? <small className="pk-cl-on">{t('pk.clienten.search.on', { field: t(`pk.clienten.field.${on}`) })}</small> : null}
                    </td>
                    <td className="nowrap pk-num">{dmy(c.birth)}</td>
                    <td className="nowrap">{insurerById(c.insurer).name}</td>
                    <td className="pk-mono">{c.policy || '—'}</td>
                    <td>{cityOf(c.locationId)}</td>
                    <td>
                      <span className="pk-cl-flags">
                        {(Object.keys(c.flags) as (keyof PracticeClient['flags'])[]).map((f) => (
                          <i key={f} className={c.flags[f] ? 'on' : ''} title={t(`pk.clienten.flag.${f}`)}>
                            <PkIcon name={FLAG_ICON[f]} size={14} />
                          </i>
                        ))}
                      </span>
                    </td>
                    <td className="end">
                      <button
                        className="icon-button small pk-cl-open"
                        title={t('pk.clienten.openFile')}
                        aria-label={`${t('pk.clienten.openFile')} · ${c.first} ${c.last}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          go('dossier', { clientId: c.id });
                        }}
                      >
                        <PkIcon name="file" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <p className="pk-empty">{t('pk.clienten.none', { q: query })}</p>
        )}
        {results.length > limit ? (
          <button className="btn btn-ghost pk-cl-more" onClick={() => setLimit((n) => n + 50)}>
            {t('pk.clienten.more', { n: results.length - limit })}
          </button>
        ) : null}
      </Card>

      <div className="span-4 pk-stack">
        {selected ? (
          <ClientPanel
            key={selected.id}
            client={selected}
            foreign={foreign[selected.id] ?? ''}
            onForeign={(code) => setForeign(selected.id, code)}
            onUpdate={(patch) => update(selected.id, patch)}
            onRemove={() => {
              remove(selected.id);
              setSelectedId(list.find((c) => c.id !== selected.id)?.id ?? null);
            }}
          />
        ) : (
          <Card eyebrow={t('pk.clienten.card.eyebrow')} title={t('pk.clienten.card.empty')} />
        )}
      </div>

      {selected ? <MessageLog client={selected} today={today} /> : null}

      <Card className="span-6" eyebrow={t('pk.clienten.dup.eyebrow')} title={t('pk.clienten.dup.title')} help={t('pk.clienten.dup.help')} feature="v.merge">
        {pairs.length ? (
          <ul className="pk-list">
            {pairs.map((p, index) => {
              const a = byId(p.a);
              const b = byId(p.b);
              if (!a || !b) return null;
              return (
                <li key={p.b} className="pk-cl-dup">
                  <div className="pk-cl-dup-text">
                    <strong>
                      {a.first} {a.last} · {b.first} {b.last}
                    </strong>
                    <span className="pk-muted pk-small">
                      {dmy(a.birth)} · {t('pk.clienten.dup.online', { date: i18n.dayMonth(b.since, today) })}
                    </span>
                    <span className="pk-row">
                      {p.reasons.map((r) => (
                        <Chip key={r} tone="warn">
                          {t(`pk.clienten.dup.${r}`)}
                        </Chip>
                      ))}
                    </span>
                  </div>
                  <button className="btn btn-ghost btn-small" onClick={() => setMerging(index)}>
                    <PkIcon name="merge" size={15} />
                    {t('pk.clienten.dup.merge')}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pk-empty">{t('pk.clienten.dup.none')}</p>
        )}
      </Card>

      <NewClientDialog
        open={dialog === 'new'}
        known={list}
        onClose={() => setDialog(null)}
        onOpenExisting={(id) => {
          setDialog(null);
          setSelectedId(id);
        }}
        onSave={(client, code) => {
          add(client);
          if (code) setForeign(client.id, code);
          setSelectedId(client.id);
          setQuery('');
          setDialog(null);
        }}
      />
      <TransferDialog
        open={dialog === 'transfer'}
        clients={list}
        initial={selected}
        onClose={() => setDialog(null)}
        onDone={(client, episodes) => {
          update(client.id, { episodes });
          setSelectedId(client.id);
          setDialog(null);
        }}
      />
      {merging !== null && pairs[merging] ? (
        <MergeDialog
          a={byId(pairs[merging].a)!}
          b={byId(pairs[merging].b)!}
          onClose={() => setMerging(null)}
          onMerge={(patch) => {
            const pair = pairs[merging];
            merge(pair.a, pair.b, patch);
            setSelectedId(pair.a);
            setMerging(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** The client card: personal details, insurance, consents and reminders, membership, and the delete rule. */
function ClientPanel({
  client,
  foreign,
  onForeign,
  onUpdate,
  onRemove,
}: {
  client: PracticeClient;
  foreign: string;
  onForeign: (code: string) => void;
  onUpdate: (patch: Partial<PracticeClient>) => void;
  onRemove: () => void;
}) {
  const i18n = useI18n();
  const { t, monthYear } = i18n;
  const { today, go, demo } = usePraktijk();
  const [confirm, setConfirm] = useState(false);
  const insurer = insurerById(client.insurer);
  const episodes = client.episodes.length;
  const setFlag = (flag: keyof PracticeClient['flags'], on: boolean) => onUpdate({ flags: { ...client.flags, [flag]: on } });

  return (
    <Card
      eyebrow={t('pk.clienten.card.eyebrow')}
      title={`${client.first} ${client.last}`}
      actions={
        <button className="btn btn-primary btn-small" onClick={() => go('dossier', { clientId: client.id })}>
          <PkIcon name="file" size={15} />
          {t('pk.clienten.openFile')}
        </button>
      }
    >
      <Kv
        rows={[
          [t('pk.clienten.card.birth'), t('pk.clienten.card.age', { date: dmy(client.birth), n: ageOn(client.birth, today) })],
          [t('pk.clienten.card.bsn'), client.bsn ? <span className="pk-mono">{client.bsn}</span> : <span className="pk-muted">{t('pk.clienten.card.noBsn')}</span>],
          [
            t('pk.clienten.card.insurer'),
            <>
              {insurer.name} <span className="pk-muted pk-small">· {t('pk.clienten.card.uzovi', { code: insurer.uzovi })}</span>
            </>,
          ],
          [t('pk.clienten.card.policy'), <span className="pk-mono">{client.policy || '—'}</span>],
          [t('pk.clienten.card.address'), `${client.street}, ${client.postcode} ${client.city}`],
          [t('pk.clienten.card.phone'), <span className="pk-mono">{client.phone}</span>],
          [t('pk.clienten.card.email'), client.email],
          [t('pk.clienten.card.location'), cityOf(client.locationId)],
          [t('pk.clienten.card.since'), monthYear(client.since)],
          [
            t('pk.clienten.card.episodes'),
            episodes ? (
              <span className="pk-row">
                {client.episodes.map((e) => (
                  <Chip key={e.id} tone={e.closed ? 'outline' : 'neutral'}>
                    {t(conditionById(e.condition).label)}
                  </Chip>
                ))}
              </span>
            ) : (
              <span className="pk-muted">{t('pk.clienten.card.noEpisodes')}</span>
            ),
          ],
        ]}
      />

      <div className="pk-cl-section" data-feature="d.source d.foreign">
        <div className="pk-form">
          <Field label={t('pk.clienten.card.via')}>
            <select className="pk-input" value={client.cameVia} onChange={(e) => onUpdate({ cameVia: e.target.value as CameVia })}>
              {CAME_VIA.map((v) => (
                <option key={v} value={v}>
                  {t(`pk.via.${v}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pk.clienten.card.foreign')} hint={t('pk.clienten.cov.foreignHint')}>
            <input className="pk-input pk-mono" value={foreign} placeholder="—" onChange={(e) => onForeign(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="pk-cl-section" data-feature="d.flags">
        <h3 className="pk-cl-h">{t('pk.clienten.card.flags')}</h3>
        {(Object.keys(client.flags) as (keyof PracticeClient['flags'])[]).map((f) => (
          <Toggle
            key={f}
            checked={client.flags[f]}
            onChange={(on) => setFlag(f, on)}
            label={
              <span className="pk-cl-flag">
                <PkIcon name={FLAG_ICON[f]} size={15} />
                {t(`pk.clienten.flag.${f}`)}
              </span>
            }
            hint={t(`pk.clienten.flag.${f}Hint`)}
          />
        ))}
      </div>

      <div className={`pk-cl-member ${client.member ? 'is-member' : ''}`} data-feature="more.membership">
        <PkIcon name="star" size={18} />
        {client.member ? (
          <div>
            <strong>
              {t('pk.clienten.member.plan')} · {t('pk.clienten.member.since', { date: monthYear(memberSince(client, today)) })}
            </strong>
            <span>{t('pk.clienten.member.perk')}</span>
          </div>
        ) : (
          <div>
            <strong>{t('pk.clienten.member.none')}</strong>
            <button className="pk-cl-link" onClick={() => demo(t('pk.clienten.member.invited'))}>
              {t('pk.clienten.member.invite')}
            </button>
          </div>
        )}
      </div>

      <div className="pk-cl-delete" data-feature="v.delete">
        <button className="btn btn-ghost btn-small" disabled={episodes > 0} onClick={() => setConfirm(true)}>
          <PkIcon name="trash" size={15} />
          {t('pk.clienten.delete')}
        </button>
        <small className={episodes > 0 ? 'pk-muted' : 'pk-cl-ok'}>
          {episodes > 0 ? t(episodes === 1 ? 'pk.clienten.deleteBlocked.one' : 'pk.clienten.deleteBlocked.other', { n: episodes }) : t('pk.clienten.deleteOk')}
        </small>
      </div>

      <Modal
        open={confirm}
        title={t('pk.clienten.deleteTitle')}
        onClose={() => setConfirm(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
              {t('pk.common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setConfirm(false);
                demo(t('pk.clienten.deleted', { name: `${client.first} ${client.last}` }));
                onRemove();
              }}
            >
              {t('pk.common.delete')}
            </button>
          </>
        }
      >
        <p>{t('pk.clienten.deleteConfirm', { name: isolate(`${client.first} ${client.last}`) })}</p>
      </Modal>
    </Card>
  );
}

/** What the practice sent this client: confirmations, reminders, intake, aftercare, newsletters and invoices. */
function MessageLog({ client, today }: { client: PracticeClient; today: Date }) {
  const i18n = useI18n();
  const { t, clock } = i18n;
  const log = useMemo(() => messageLog(client, today), [client.id, client.flags, today]);
  return (
    <Card className="span-6" eyebrow={t('pk.clienten.log.eyebrow')} title={t('pk.clienten.log.title')} feature="d.log" help={`${client.first} ${client.last} · ${client.email}`}>
      <TableWrap label={t('pk.clienten.log.title')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.common.date')}</th>
              <th>{t('pk.clienten.log.channel')}</th>
              <th>{t('pk.clienten.log.subject')}</th>
              <th>{t('pk.common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {log.map((m) => (
              <tr key={m.id}>
                <td className="nowrap pk-num">
                  {i18n.dayMonth(m.at, today)} · {clock(m.at)}
                </td>
                <td>
                  <span className="pk-cl-channel">
                    <PkIcon name={CHANNEL_ICON[m.channel]} size={15} />
                    {t(`pk.clienten.log.channel.${m.channel}`)}
                  </span>
                </td>
                <td>{t(`pk.clienten.log.subject.${m.subject}`)}</td>
                <td>
                  <Chip tone={m.status === 'failed' ? 'bad' : m.status === 'opened' ? 'good' : 'neutral'}>{t(`pk.clienten.log.status.${m.status}`)}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

