import { useMemo, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import type { DossierState } from '../../data/dossier';
import { PkIcon } from '../../icons';
import { Card, Chip, TableWrap } from '../../kit';
import { useTxt } from './useDossier';
import { staffName } from './util';

/** The change log of the file: every change with time and who made it; it can be searched, never edited. */
export function LogTab({ state }: { state: DossierState }) {
  const i18n = useI18n();
  const { t, clock } = i18n;
  const { today } = usePraktijk();
  const txt = useTxt();
  const [query, setQuery] = useState('');
  const who = (w: string) => (w === 'you' ? t('pk.dossier.log.you') : w === 'web' ? t('pk.dossier.log.web') : staffName(w));
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.log.filter((l) => !q || txt(l.line).toLowerCase().includes(q) || who(l.who).toLowerCase().includes(q));
  }, [state.log, query, txt]);

  return (
    <Card
      eyebrow={t('pk.dossier.log.eyebrow')}
      title={t('pk.dossier.log.title')}
      help={t('pk.dossier.log.help')}
      feature="e.log"
      actions={<Chip tone="outline">{t('pk.dossier.log.count', { n: rows.length })}</Chip>}
    >
      <label className="pk-search pk-ds-log-search">
        <PkIcon name="search" size={16} />
        <input className="pk-input" type="search" value={query} aria-label={t('pk.dossier.log.search')} placeholder={t('pk.dossier.log.search')} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <TableWrap label={t('pk.dossier.log.title')}>
        <table className="pk-table pk-cards">
          <thead>
            <tr>
              <th>{t('pk.dossier.log.when')}</th>
              <th>{t('pk.dossier.log.who')}</th>
              <th>{t('pk.dossier.log.what')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className={l.who === 'you' ? 'pk-ds-log-new' : ''}>
                <td className="nowrap pk-num pk-cell-main">
                  {i18n.dayMonth(l.at, today)} · {clock(l.at)}
                </td>
                <td className="nowrap pk-cell-side pk-muted">{who(l.who)}</td>
                <td className="pk-cell-full">{txt(l.line)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
