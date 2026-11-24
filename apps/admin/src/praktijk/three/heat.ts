import { CLINIC_COLORS } from '@pure-clinics/shared';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { damp, type Stage, type Vec } from '../../three/stage';

// When it is busy, as a small landscape on a sand plinth: one column per hour (left to right) and one row per weekday
// (Monday at the back, Saturday in front). A column's height is how many treatments run at the same time in that hour,
// its colour runs from cream to walnut. Hours the clinic is closed lie flat as pale tiles. Columns grow in on arrival
// and move to new heights when the location changes.

export type HeatLayout = { camera: Vec; target: Vec; intro: Vec; fitAspect: number };

export const HEAT_WIDE: HeatLayout = { camera: [3.2, 6.4, 8.6], target: [0, 0.35, 0.1], intro: [7, 9, 13], fitAspect: 1.75 };
export const HEAT_COMPACT: HeatLayout = { camera: [1.0, 9.2, 7.2], target: [-0.55, 0.2, -0.75], intro: [4, 12, 12], fitAspect: 1.56 };

const STEP = 0.56;
const SIZE = 0.44;
const MAX_HEIGHT = 2.3;
const LOW = new THREE.Color('#EFE4D3');
const MID = new THREE.Color(CLINIC_COLORS.taupe);
const HIGH = new THREE.Color('#6F3A22');
const CLOSED = new THREE.Color('#E8DFD2');
const HOVER = new THREE.Color('#2F4A3C');

export type HeatInput = { value: number; open: boolean }[];

type Column = { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; height: number; target: number; delay: number; open: boolean; level: number };

/** Cream to sand to walnut, so a quiet hour stays light and the busiest one is the brand's brown. */
function tone(level: number, out: THREE.Color): THREE.Color {
  return level < 0.5 ? out.copy(LOW).lerp(MID, level * 2) : out.copy(MID).lerp(HIGH, (level - 0.5) * 2);
}

export class HeatScene {
  private readonly columns: Column[] = [];
  private readonly unsubscribe: () => void;
  private hovered: number | null = null;
  private born = -1;

  constructor(
    private readonly stage: Stage,
    cols: number,
    rows: number,
    rowLabels: string[],
    colLabels: string[],
    input: HeatInput,
    private readonly onHover: (index: number | null) => void,
  ) {
    const width = cols * STEP;
    const depth = rows * STEP;

    const white = new THREE.MeshStandardMaterial({ color: '#FCF9F4', roughness: 0.92 });
    const sand = new THREE.MeshStandardMaterial({ color: CLINIC_COLORS.sand, roughness: 0.95 });
    const base = new THREE.Mesh(new RoundedBoxGeometry(width + 2.2, 0.12, depth + 1.4, 2, 0.05), white);
    base.position.set(-0.45, -0.16, 0.15);
    base.receiveShadow = true;
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(width + 0.3, 0.1, depth + 0.3, 2, 0.04), sand);
    plinth.position.set(0, -0.05, 0);
    plinth.receiveShadow = true;
    stage.scene.add(base, plinth);

    const geometry = new RoundedBoxGeometry(SIZE, 1, SIZE, 2, 0.05);
    // The box is centred; move it up so scaling its height grows it from the plinth.
    geometry.translate(0, 0.5, 0);
    const targets: THREE.Object3D[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const material = new THREE.MeshStandardMaterial({ color: CLOSED, roughness: 0.62, metalness: 0.02 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((c - (cols - 1) / 2) * STEP, 0, (r - (rows - 1) / 2) * STEP);
        mesh.scale.y = 0.001;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.index = i;
        stage.scene.add(mesh);
        targets.push(mesh);
        this.columns.push({ mesh, material, height: 0.001, target: 0.001, delay: (c + (rows - 1 - r)) * 0.035, open: false, level: 0 });
      }
    }
    this.update(input);

    // Day names along the left edge, hours along the front, as small HTML labels that stay crisp.
    rowLabels.forEach((text, r) => {
      const el = document.createElement('span');
      el.className = 'pk-ov-heat-axis pk-ov-heat-axis--row';
      el.textContent = text;
      const anchor = new THREE.Object3D();
      anchor.position.set(-width / 2 - 1.05, 0.02, (r - (rows - 1) / 2) * STEP);
      stage.scene.add(anchor);
      stage.label(el, anchor, [0, 0, 0]);
    });
    colLabels.forEach((text, c) => {
      if (!text) return;
      const el = document.createElement('span');
      el.className = 'pk-ov-heat-axis';
      el.textContent = text;
      const anchor = new THREE.Object3D();
      anchor.position.set((c - (cols - 1) / 2) * STEP, 0.02, depth / 2 + 0.5);
      stage.scene.add(anchor);
      stage.label(el, anchor, [0, 0, 0]);
    });

    stage.setHoverTargets(targets, (object) => {
      this.hovered = object ? (object.userData.index as number) : null;
      this.onHover(this.hovered);
    });
    stage.onSelect(
      (object) => {
        this.hovered = object ? (object.userData.index as number) : null;
        this.onHover(this.hovered);
      },
      () => true,
    );

    const key = new THREE.DirectionalLight('#FFF6EC', 2.2);
    key.position.set(-4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, far: 30 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    const rim = new THREE.DirectionalLight('#F3E6D6', 0.55);
    rim.position.set(6, 4, -6);
    const fill = new THREE.HemisphereLight('#FFFFFF', CLINIC_COLORS.sand, 0.6);
    stage.scene.add(key, rim, fill);

    this.unsubscribe = stage.onFrame((time, delta) => this.frame(time, delta));
  }

  /** New values (another location): the columns move to their new heights and colours. */
  update(input: HeatInput) {
    const max = Math.max(0.5, ...input.map((c) => c.value));
    input.forEach((cell, i) => {
      const col = this.columns[i];
      if (!col) return;
      col.open = cell.open;
      col.level = cell.open ? cell.value / max : 0;
      col.target = cell.open ? Math.max(0.06, col.level * MAX_HEIGHT) : 0.02;
    });
  }

  /** Points at a column from outside, e.g. from the list next to the model. */
  point(index: number | null) {
    this.hovered = index;
  }

  dispose() {
    this.unsubscribe();
  }

  private frame(time: number, delta: number) {
    if (this.born < 0) this.born = time;
    const age = time - this.born;
    const still = this.stage.reducedMotion;
    const color = new THREE.Color();
    this.columns.forEach((col, i) => {
      const go = still || age > col.delay;
      col.height = still ? col.target : damp(col.height, go ? col.target : 0.001, 6, delta);
      col.mesh.scale.y = col.height;
      const on = i === this.hovered;
      if (!col.open) color.copy(CLOSED);
      else tone(col.level, color);
      if (on) color.lerp(HOVER, 0.55);
      col.material.color.copy(color);
      col.material.opacity = col.open ? 1 : 0.7;
      col.material.transparent = !col.open;
    });
  }
}
