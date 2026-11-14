import { CLINIC_COLORS } from '@pure-clinics/shared';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { figureKit, teamLook, Therapist } from '../../three/figures';
import { damp, type Stage, type Vec } from '../../three/stage';

// The team of Pure as a quiet group portrait: everyone standing in a shallow arc on a round sand plinth, the way the
// clinics' models show them, with a card at each one's feet. Nothing happens unless someone is pointed at or chosen.

/** How the lineup is laid out: wide for a desktop, close together for a phone. */
export type Layout = {
  /** Distance between two neighbours along the arc, in figure units (a figure is about 1.8 tall). */
  spacing: number;
  /** Radius of the arc; the ends come slightly forward, toward the camera. */
  radius: number;
  camera: Vec;
  target: Vec;
  intro: Vec;
  /** The narrowest view (width to height) in which the whole lineup still fits. */
  fitAspect: number;
};

export const WIDE: Layout = { spacing: 1.32, radius: 20, camera: [0, 2.6, 7.6], target: [0, 0.45, 0.3], intro: [3.5, 4.6, 12], fitAspect: 2.35 };
export const COMPACT: Layout = { spacing: 0.85, radius: 14, camera: [0, 1.8, 8.4], target: [0, 0.37, 0.3], intro: [2.5, 4.4, 12], fitAspect: 1.35 };

type Figure = {
  therapist: Therapist;
  /** The way she faces when idle: toward the camera. */
  facing: number;
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshStandardMaterial;
  lift: number;
  glow: number;
  label: CSS2DObject;
};

const RING_IDLE = new THREE.Color('#E2D6C6');
const RING_ON = new THREE.Color(CLINIC_COLORS.taupeDark);

export class TeamScene {
  /** One element per team member, at her feet; the page renders her card into it. */
  readonly anchors: HTMLDivElement[] = [];

  private readonly figures: Figure[] = [];
  private readonly unsubscribe: () => void;
  private pointerHover: number | null = null;
  private cardHover: number | null = null;
  private selected: number | null = null;

  constructor(
    private readonly stage: Stage,
    names: string[],
    layout: Layout,
    private readonly onHover: (index: number | null) => void,
    onSelect: (index: number) => void,
  ) {
    const kit = figureKit();
    const n = names.length;
    const half = ((n - 1) / 2) * layout.spacing;

    // A shallow rectangular plinth on a slightly larger white base, like the clinic tiles on the overview (no round shapes).
    const white = new THREE.MeshStandardMaterial({ color: '#FBF8F3', roughness: 0.9 });
    const sand = new THREE.MeshStandardMaterial({ color: CLINIC_COLORS.sand, roughness: 0.94 });
    const depth = layout === COMPACT ? 1.25 : 1.55;
    const base = new THREE.Mesh(new RoundedBoxGeometry(2 * (half + 1.35), 0.12, 2 * (depth + 0.35), 2, 0.05), white);
    base.position.set(0, -0.2, 0.45);
    base.receiveShadow = true;
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(2 * (half + 1.05), 0.14, 2 * depth, 2, 0.04), sand);
    plinth.position.set(0, -0.07, 0.45);
    plinth.receiveShadow = true;
    stage.scene.add(base, plinth);

    const [camX, , camZ] = layout.camera;
    const targets: THREE.Object3D[] = [];
    names.forEach((name, i) => {
      const theta = ((i - (n - 1) / 2) * layout.spacing) / layout.radius;
      const x = layout.radius * Math.sin(theta);
      const z = layout.radius * (1 - Math.cos(theta));
      const therapist = new Therapist(kit, teamLook(name, ['bun', 'tail', 'bob', 'crop']));
      // Turned toward the camera, so the group reads as a portrait rather than a row of profiles.
      const facing = Math.atan2(camX - x, camZ - z);
      therapist.group.position.set(x, 0, z);
      therapist.group.rotation.y = facing;
      therapist.group.userData.index = i;
      therapist.pose(0, 0);
      stage.scene.add(therapist.group);
      targets.push(therapist.group);

      // A thin square frame on the plinth marks who is pointed at or chosen.
      const ringMaterial = new THREE.MeshStandardMaterial({ color: RING_IDLE, roughness: 0.7, transparent: true, opacity: 0.55 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.42, 4, 1, Math.PI / 4), ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.006, z);
      stage.scene.add(ring);

      const anchor = document.createElement('div');
      anchor.className = 'pk-tm-anchor';
      const label = stage.label(anchor, therapist.group, [0, -0.04, 0.32]);
      // The card hangs from this point: its top edge at her feet.
      label.center.set(0.5, 0);
      this.anchors.push(anchor);

      this.figures.push({ therapist, facing, ring, ringMaterial, lift: 0, glow: 0, label });
    });

    stage.setHoverTargets(targets, (object) => {
      this.pointerHover = object ? (object.userData.index as number) : null;
      this.emitHover();
    });
    stage.onSelect(
      (object) => {
        if (object) onSelect(object.userData.index as number);
      },
      () => true,
    );

    const key = new THREE.DirectionalLight('#FFF6EC', 2.3);
    key.position.set(-5, 9, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 6, bottom: -4, far: 30 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    const rim = new THREE.DirectionalLight('#F3E6D6', 0.6);
    rim.position.set(6, 5, -6);
    const fill = new THREE.HemisphereLight('#FFFFFF', CLINIC_COLORS.sand, 0.55);
    stage.scene.add(key, rim, fill);

    this.unsubscribe = stage.onFrame((time, delta) => this.frame(time, delta));
  }

  /** The page points at someone's card: she lifts, as when the pointer is on her in the model. */
  hover(index: number | null) {
    this.cardHover = index;
    this.emitHover();
  }

  /** The chosen team member keeps her ring and stands a little forward. */
  select(index: number | null) {
    this.selected = index;
  }

  dispose() {
    this.unsubscribe();
  }

  private emitHover() {
    this.onHover(this.cardHover ?? this.pointerHover);
  }

  private frame(time: number, delta: number) {
    const hovered = this.cardHover ?? this.pointerHover;
    const still = this.stage.reducedMotion;
    this.figures.forEach((f, i) => {
      const on = i === hovered;
      const chosen = i === this.selected;
      f.lift = damp(f.lift, on ? 0.08 : chosen ? 0.03 : 0, 9, delta);
      f.glow = damp(f.glow, on || chosen ? 1 : 0, 7, delta);
      const body = f.therapist.body;
      body.position.y = f.lift;
      // Breathing and a slow glance around: just enough to feel alive.
      const breathe = still ? 1 : 1 + Math.sin(time * 1.15 + i * 0.9) * 0.007;
      body.scale.set(1, breathe, 1);
      f.therapist.group.rotation.y = f.facing + (still ? 0 : Math.sin(time * 0.26 + i * 1.7) * 0.07 * (1 - f.glow));
      f.therapist.pose(0, time);
      f.ringMaterial.color.copy(RING_IDLE).lerp(RING_ON, f.glow);
      f.ringMaterial.opacity = 0.55 + f.glow * 0.4;
      const scale = 1 + f.glow * 0.18;
      f.ring.scale.set(scale, scale, 1);
    });
  }
}
