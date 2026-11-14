import { useState, type ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { dmy, insurerById, type PracticeClient } from '../../data/core';
import { PkIcon } from '../../icons';
import { Modal, TableWrap } from '../../kit';

type FieldId = 'name' | 'birth' | 'email' | 'phone' | 'address' | 'bsn' | 'insurer' | 'policy';
const FIELDS: FieldId[] = ['name', 'birth', 'email', 'phone', 'address', 'bsn', 'insurer', 'policy'];

/** What a field shows and what it writes back when its side is chosen. */
function valueOf(c: PracticeClient, f: FieldId): string {
  switch (f) {
    case 'name':
      return `${c.first} ${c.last}`;
    case 'birth':
      return dmy(c.birth);
    case 'email':
      return c.email;
    case 'phone':
      return c.phone;
    case 'address':
      return `${c.street}, ${c.postcode} ${c.city}`;
    case 'bsn':
      return c.bsn;
    case 'insurer':
      return insurerById(c.insurer).name;
    case 'policy':
      return c.policy;
  }
}

function patchOf(c: PracticeClient, f: FieldId): Partial<PracticeClient> {
  switch (f) {
    case 'name':
      return { first: c.first, last: c.last, short: c.short };
    case 'birth':
      return { birth: c.birth };
    case 'email':
      return { email: c.email };
    case 'phone':
      return { phone: c.phone };
    case 'address':
      return { street: c.street, postcode: c.postcode, city: c.city };
    case 'bsn':
      return { bsn: c.bsn };
    case 'insurer':
      return { insurer: c.insurer };
    case 'policy':
      return { policy: c.policy };
  }
}

const LABEL: Record<FieldId, 'pk.clienten.col.name' | 'pk.clienten.card.birth' | 'pk.clienten.card.email' | 'pk.clienten.card.phone' | 'pk.clienten.card.address' | 'pk.clienten.card.bsn' | 'pk.clienten.card.insurer' | 'pk.clienten.card.policy'> = {
  name: 'pk.clienten.col.name',
  birth: 'pk.clienten.card.birth',
  email: 'pk.clienten.card.email',
  phone: 'pk.clienten.card.phone',
  address: 'pk.clienten.card.address',
  bsn: 'pk.clienten.card.bsn',
  insurer: 'pk.clienten.card.insurer',
  policy: 'pk.clienten.card.policy',
};

/** Merging two cards of the same person: per field one side is kept; episodes and consents of both come together. */
export function MergeDialog({ a, b, onClose, onMerge }: { a: PracticeClient; b: PracticeClient; onClose: () => void; onMerge: (patch: Partial<PracticeClient>) => void }) {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [pick, setPick] = useState<Record<FieldId, 'a' | 'b'>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f, valueOf(a, f) ? 'a' : 'b'])) as Record<FieldId, 'a' | 'b'>,
  );

  const merge = () => {
    const patch: Partial<PracticeClient> = {};
    for (const f of FIELDS) Object.assign(patch, patchOf(pick[f] === 'a' ? a : b, f));
    patch.episodes = [...a.episodes, ...b.episodes];
    patch.flags = {
      newsletter: a.flags.newsletter || b.flags.newsletter,
      sms: a.flags.sms || b.flags.sms,
      email: a.flags.email || b.flags.email,
      share: a.flags.share || b.flags.share,
    };
    onMerge(patch);
    const kept = pick.name === 'a' ? a : b;
    demo(t('pk.clienten.dup.done', { name: `${kept.first} ${kept.last}` }));
  };

  const cell = (c: PracticeClient, side: 'a' | 'b', f: FieldId): ReactNode => {
    const value = valueOf(c, f);
    return (
      <label className={`pk-cl-pick ${pick[f] === side ? 'on' : ''}`}>
        <input type="radio" name={`merge-${f}`} checked={pick[f] === side} onChange={() => setPick((p) => ({ ...p, [f]: side }))} />
        {value ? <span className={f === 'bsn' || f === 'policy' || f === 'phone' ? 'pk-mono' : ''}>{value}</span> : <span className="pk-muted">{t('pk.clienten.dup.blank')}</span>}
      </label>
    );
  };

  return (
    <Modal
      open
      wide
      title={t('pk.clienten.dup.mergeTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={merge}>
            <PkIcon name="merge" size={16} />
            {t('pk.clienten.dup.merge')}
          </button>
        </>
      }
    >
      <p className="help">{t('pk.clienten.dup.mergeHelp')}</p>
      <TableWrap label={t('pk.clienten.dup.mergeTitle')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.clienten.dup.field')}</th>
              <th>{t('pk.clienten.dup.cardA')}</th>
              <th>{t('pk.clienten.dup.cardB')}</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f) => (
              <tr key={f}>
                <td className="pk-muted nowrap">{t(LABEL[f])}</td>
                <td>{cell(a, 'a', f)}</td>
                <td>{cell(b, 'b', f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Modal>
  );
}
