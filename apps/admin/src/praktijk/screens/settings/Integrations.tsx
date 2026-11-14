import { addDays } from '@pure-clinics/shared';
import { useState, type ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { useShared, usePraktijk } from '../../context';
import { INTEGRATIONS, REFERRALS, SUPPLIERS, type Integration, type IntegrationId } from '../../data/settings';
import { conditionById } from '../../data/core';
import { rng } from '../../../data/random';
import { Chip, Kv, Seg, Toggle, copyText } from '../../kit';
import { PkIcon } from '../../icons';

type State = Record<IntegrationId, boolean>;

const randomKey = (seed: string) => {
  const r = rng(seed);
  return Array.from({ length: 32 }, () => 'abcdef0123456789'[Math.floor(r() * 16)]).join('');
};

/** Every link with the outside world, each with an on/off switch and its state. */
export function IntegrationsTab() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [on, setOn] = useShared<State>('settings.integrations', () => Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i.on])) as State);
  const flip = (i: Integration) => {
    if (i.planned) {
      demo(t('pk.instellingen.int.plannedToast'));
      return;
    }
    setOn((s) => ({ ...s, [i.id]: !s[i.id] }));
    demo(t(on[i.id] ? 'pk.instellingen.int.offToast' : 'pk.instellingen.int.onToast', { name: nameOf(i.id) }));
  };
  const nameOf = (id: IntegrationId) => t(`pk.instellingen.int.${id}.name`);
  const connected = INTEGRATIONS.filter((i) => on[i.id] && !i.planned).length;

  return (
    <div className="pk-grid">
      <p className="pk-se-intro pk-small">
        <PkIcon name="plug" size={16} />
        {t('pk.instellingen.int.summary', { n: connected, total: INTEGRATIONS.length })}
      </p>
      {INTEGRATIONS.map((i) => (
        <IntegrationCard key={i.id} integration={i} name={nameOf(i.id)} on={on[i.id]} onFlip={() => flip(i)}>
          <Details id={i.id} on={on[i.id]} />
        </IntegrationCard>
      ))}
    </div>
  );
}

function IntegrationCard({ integration, name, on, onFlip, children }: { integration: Integration; name: string; on: boolean; onFlip: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const status = integration.planned ? 'planned' : on ? 'connected' : 'off';
  const tone = status === 'connected' ? 'good' : status === 'planned' ? 'warn' : 'outline';
  return (
    <section className={`card pk-card pk-se-int span-6 ${on ? '' : 'is-off'}`} data-feature={integration.feature}>
      <div className="pk-se-int-head">
        <span className="pk-se-int-icon">
          <PkIcon name={integration.icon} size={20} />
        </span>
        <span className="pk-stack pk-se-int-title">
          <span className="eyebrow">{t(`pk.instellingen.int.group.${integration.group}`)}</span>
          <strong>{name}</strong>
        </span>
        <Chip tone={tone}>{t(`pk.instellingen.int.status.${status}`)}</Chip>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={name}
          className="pk-switch"
          disabled={integration.planned}
          onClick={onFlip}
        >
          <i />
        </button>
      </div>
      <p className="pk-small pk-muted pk-se-int-text">{t(`pk.instellingen.int.${integration.id}.text`)}</p>
      {children}
    </section>
  );
}

function Details({ id, on }: { id: IntegrationId; on: boolean }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, demo, go } = usePraktijk();
  const [ledger, setLedger] = useState<'exact' | 'twinfield'>('exact');
  const [key, setKey] = useState(() => randomKey('pk-bi'));
  const [shown, setShown] = useState(false);
  const [session, setSession] = useState<string | null>(null);
  const [surveyAfter, setSurveyAfter] = useState(true);

  switch (id) {
    case 'vecozo':
      return (
        <Kv
          rows={[
            [t('pk.instellingen.int.vecozo.cert'), t('pk.instellingen.int.validUntil', { date: i18n.dayMonth(addDays(today, 412), today) })],
            [t('pk.instellingen.int.vecozo.cov'), <Chip tone={on ? 'good' : 'outline'}>{t(on ? 'pk.instellingen.int.consentOk' : 'pk.common.off')}</Chip>],
            [t('pk.instellingen.int.vecozo.claims'), <Chip tone={on ? 'good' : 'outline'}>{t(on ? 'pk.instellingen.int.consentOk' : 'pk.common.off')}</Chip>],
          ]}
        />
      );
    case 'zorgdomein':
      return (
        <ul className="pk-list pk-se-ref">
          {REFERRALS.map((r) => (
            <li key={r.id}>
              <PkIcon name="file" size={16} />
              <span className="pk-stack pk-se-grow">
                <strong>{t('pk.instellingen.int.zorgdomein.ref', { client: r.client, condition: { msg: conditionById(r.condition).label } })}</strong>
                <small className="pk-muted">
                  {r.gp}, {r.city} · {i18n.dayMonth(addDays(today, -r.daysAgo), today)}
                </small>
              </span>
              <button className="btn btn-ghost btn-small" onClick={() => demo(t('pk.instellingen.int.zorgdomein.letter'))}>
                {t('pk.instellingen.int.zorgdomein.open')}
              </button>
            </li>
          ))}
        </ul>
      );
    case 'zorgmail':
      return (
        <div className="pk-row">
          <Chip tone="brand" icon="send">
            {t('pk.instellingen.int.zorgmail.sent', { n: 3 })}
          </Chip>
          <button className="btn btn-ghost btn-small" disabled={!on} onClick={() => demo()}>
            {t('pk.instellingen.int.zorgmail.report')}
          </button>
        </div>
      );
    case 'qualizorg':
      return (
        <div className="pk-stack">
          <Toggle checked={surveyAfter} onChange={setSurveyAfter} label={t('pk.instellingen.int.qualizorg.after')} />
          <button className="btn btn-ghost btn-small pk-se-self" onClick={() => go('rapportages', { feature: 'p.qualizorg' })}>
            <PkIcon name="chart" size={14} />
            {t('pk.instellingen.int.qualizorg.results')}
          </button>
        </div>
      );
    case 'boekhouding':
      return (
        <div className="pk-stack">
          <Seg
            label={t('pk.instellingen.int.boekhouding.name')}
            value={ledger}
            onChange={setLedger}
            options={[
              { value: 'exact', label: 'Exact Online' },
              { value: 'twinfield', label: 'Twinfield' },
            ]}
          />
          <span className="pk-small pk-muted">
            {on ? t('pk.instellingen.int.boekhouding.synced', { time: '06:00' }) : t('pk.instellingen.int.status.off')}
          </span>
        </div>
      );
    case 'bi':
      return (
        <div className="pk-stack">
          <span className="pk-se-key">
            <span className="pk-mono">{shown ? key : `${key.slice(0, 4)}${'•'.repeat(20)}${key.slice(-4)}`}</span>
            <button className="icon-button small" aria-label={t('pk.instellingen.int.bi.show')} onClick={() => setShown((s) => !s)}>
              <PkIcon name={shown ? 'eyeOff' : 'eye'} size={16} />
            </button>
            <button
              className="icon-button small"
              aria-label={t('pk.common.copy')}
              onClick={async () => demo((await copyText(key)) ? t('pk.common.copied') : t('pk.common.copy'))}
            >
              <PkIcon name="copy" size={16} />
            </button>
          </span>
          <div className="pk-row">
            <Chip tone="outline">Excel</Chip>
            <Chip tone="outline">Power BI</Chip>
            <button
              className="btn btn-ghost btn-small"
              onClick={() => {
                setKey(randomKey(`pk-bi-${Date.now()}`));
                demo(t('pk.instellingen.int.bi.newKeyToast'));
              }}
            >
              <PkIcon name="refresh" size={14} />
              {t('pk.instellingen.int.bi.newKey')}
            </button>
          </div>
        </div>
      );
    case 'api':
      return (
        <Kv
          rows={[
            [t('pk.instellingen.int.api.today'), '7'],
            [t('pk.instellingen.int.api.channels'), t('pk.instellingen.int.api.channelsValue')],
          ]}
        />
      );
    case 'suppliers':
      return (
        <div className="pk-row">
          {SUPPLIERS.map((s) => (
            <Chip key={s} tone="outline">
              {s}
            </Chip>
          ))}
        </div>
      );
    case 'teamviewer':
      return (
        <div className="pk-row">
          {session ? (
            <Chip tone="now" icon="eye">
              {t('pk.instellingen.int.teamviewer.code', { code: session })}
            </Chip>
          ) : null}
          <button
            className="btn btn-ghost btn-small"
            onClick={() => {
              const r = rng(`tv-${Date.now()}`);
              setSession(`${Math.floor(100 + r() * 900)} ${Math.floor(100 + r() * 900)} ${Math.floor(100 + r() * 900)}`);
            }}
          >
            {session ? t('pk.instellingen.int.teamviewer.again') : t('pk.instellingen.int.teamviewer.start')}
          </button>
        </div>
      );
    case 'erecept':
      return <Chip tone="warn" icon="clock">{t('pk.instellingen.int.erecept.when')}</Chip>;
  }
}
