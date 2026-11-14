import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Accent, useI18n } from '../../../i18n';
import { Stage } from '../../../three/stage';
import { cityOf, roleKey } from '../../data/core';
import type { Member } from '../../data/team';
import { Chip } from '../../kit';
import { COMPACT, TeamScene, WIDE } from '../../three/team';
import { MemberPhoto } from './shared';

type Props = { members: Member[]; chosen: string; onChoose: (id: string) => void; compact: boolean };

/**
 * The team in 3D, standing in a shallow arc, each with her portrait card at her feet. Built once per mount; the page
 * remounts it when the language or the phone/desktop layout changes.
 */
export function Lineup({ members, chosen, onChoose, compact }: Props) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TeamScene | null>(null);
  const [anchors, setAnchors] = useState<HTMLDivElement[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const choose = useRef(onChoose);
  choose.current = onChoose;
  // The lineup is the real team, in the order of data/core.ts; people added in the demo only appear in the tables.
  const team = members.filter((m) => m.staffId);

  useEffect(() => {
    const layout = compact ? COMPACT : WIDE;
    const stage = new Stage(host.current!, {
      camera: layout.camera,
      target: layout.target,
      intro: layout.intro,
      fov: 30,
      minDistance: 6,
      maxDistance: 16,
      minPolarAngle: 1.05,
      maxPolarAngle: 1.47,
      minAzimuthAngle: -0.55,
      maxAzimuthAngle: 0.55,
      fitAspect: layout.fitAspect,
      sway: 0.04,
    });
    const teamScene = new TeamScene(
      stage,
      team.map((m) => m.name),
      layout,
      setHover,
      (index) => choose.current(team[index].id),
    );
    scene.current = teamScene;
    setAnchors(teamScene.anchors);
    return () => {
      teamScene.dispose();
      stage.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    const index = team.findIndex((m) => m.id === chosen);
    scene.current?.select(index >= 0 ? index : null);
  }, [chosen, anchors]);

  const active = members.filter((m) => m.active).length;
  const twofa = members.filter((m) => m.active && m.twofa).length;
  return (
    <section className="card pk-card pk-tm-lineup">
      <div className="card-head">
        <div>
          <span className="eyebrow">{t('pk.team.lineupEyebrow')}</span>
          <h2 className="card-title">
            <Accent text={t('pk.team.lineupTitle')} />
          </h2>
        </div>
        <div className="head-actions">
          <Chip tone="good" icon="check">
            {t('pk.team.activeCount', { n: active })}
          </Chip>
          <Chip tone="brand" icon="shieldCheck">
            {t('pk.team.twofaCount', { n: twofa })}
          </Chip>
        </div>
      </div>
      <p className="help">{t('pk.team.lineupHelp')}</p>
      <div className={`scene-host pk-tm-stage ${compact ? 'is-compact' : ''}`} ref={host} role="group" aria-label={t('pk.team.lineupHelp')}>
        <span className="scene-hint">{t('pk.team.lineupHint')}</span>
      </div>
      {anchors.map((anchor, i) => {
        const m = team[i];
        if (!m) return null;
        const place = m.role === 'beauty' ? 'Blanche Beauty Studio' : cityOf(m.locationId);
        return createPortal(
          <button
            type="button"
            className={`pk-tm-card ${hover === i ? 'is-hover' : ''} ${chosen === m.id ? 'is-chosen' : ''} ${m.active ? '' : 'is-off'}`}
            aria-pressed={chosen === m.id}
            onClick={() => onChoose(m.id)}
            onPointerEnter={() => scene.current?.hover(i)}
            onPointerLeave={() => scene.current?.hover(null)}
            onFocus={() => scene.current?.hover(i)}
            onBlur={() => scene.current?.hover(null)}
          >
            <MemberPhoto member={m} size={compact ? 28 : 46} />
            <strong>{m.name}</strong>
            {compact ? null : (
              <>
                <small>{t(roleKey(m.role))}</small>
                <small className="pk-tm-place">{place}</small>
              </>
            )}
          </button>,
          anchor,
          m.id,
        );
      })}
    </section>
  );
}
