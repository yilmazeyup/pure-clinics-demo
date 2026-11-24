import { CLINIC_COLORS } from '@pure-clinics/shared';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { damp, type Stage, type Vec } from '../../three/stage';

// When it is busy, as a small landscape on a round turntable: one column per two-hour block (left to right) and one
// row per weekday (Monday at the back, Saturday in front). A column's height is how many treatments run at the same
// time, its colour one soft scale from cream to walnut. The day and hour names are printed flat on the plinth, so
// they turn with it and never float over a column. The busiest block carries one small tag. It can be turned all the
// way round; left alone, it turns slowly by itself.

/** `print` scales the words on the plinth: larger on a phone, where the whole model is drawn smaller. */
export type HeatLayout = { camera: Vec; target: Vec; intro: Vec; fitAspect: number; print: number };

export const HEAT_WIDE: HeatLayout = { camera: [5.6, 8.4, 12.6], target: [0.2, 0.35, 0.35], intro: [10, 13, 17], fitAspect: 1.45, print: 1 };
export const HEAT_COMPACT: HeatLayout = { camera: [5.4, 8.6, 11.6], target: [0.2, 0.5, 0.3], intro: [10, 15, 18], fitAspect: 1.36, print: 1.45 };

const STEP = 1;
const SIZE = 0.6;
const MAX_HEIGHT = 2.6;
const LOW = new THREE.Color('#EEE3D4');
const MID = new THREE.Color('#C9A882');
const HIGH = new THREE.Color('#6F3A22');
const CLOSED = new THREE.Color('#E4D9CA');
const FOCUS = new THREE.Color('#3F3128');
const FONT = "500 88px Jost, 'IBM Plex Sans Arabic', system-ui, sans-serif";

export type HeatInput = { value: number; open: boolean }[];

type Column = { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; height: number; target: number; width: number; delay: number; open: boolean; level: number };

/** Cream to sand to walnut, so a quiet block stays light and the busiest one is the brand's brown. */
function tone(level: number, out: THREE.Color): THREE.Color {
  return level < 0.5 ? out.copy(LOW).lerp(MID, level * 2) : out.copy(MID).lerp(HIGH, (level - 0.5) * 2);
}

/** A word printed flat on the plinth: a canvas texture on a plane lying down, crisp at any angle. */
function printed(text: string, height: number, color: string): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.height = 128;
  canvas.width = Math.max(128, Math.ceil(text.length * 62 + 40));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const draw = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = FONT;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
    texture.needsUpdate = true;
  };
  draw();
  // The brand font may still be loading; print again once it is there.
  document.fonts?.load(FONT).then(draw, () => undefined);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((height * canvas.width) / canvas.height, height), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

export class HeatScene {
  private readonly columns: Column[] = [];
  private readonly unsubscribe: () => void;
  private readonly tag: HTMLSpanElement;
  private readonly tagAnchor = new THREE.Object3D();
  private hovered: number | null = null;
  private peak = -1;
  private born = -1;

  constructor(
    private readonly stage: Stage,
    private readonly cols: number,
    rows: number,
    rowLabels: string[],
    colLabels: string[],
    input: HeatInput,
    private readonly onHover: (index: number | null) => void,
    print = 1,
  ) {
    const width = cols * STEP;
    const depth = rows * STEP;
    const top = 0;

    // A round turntable: it looks the same from every side, so turning it all the way round stays calm.
    const radius = Math.hypot(width, depth) / 2 + 0.85;
    const cream = new THREE.MeshStandardMaterial({ color: '#FBF7F1', roughness: 0.9 });
    const sand = new THREE.MeshStandardMaterial({ color: '#F1E8DC', roughness: 0.95 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.06, 0.22, 128), cream);
    base.position.y = top - 0.11;
    base.receiveShadow = true;
    const inlay = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.22, radius - 0.22, 0.012, 128), sand);
    inlay.position.y = top + 0.006;
    inlay.receiveShadow = true;
    stage.scene.add(base, inlay);

    const geometry = new RoundedBoxGeometry(SIZE, 1, SIZE, 3, 0.07);
    // The box is centred; move it up so scaling its height grows it from the plinth.
    geometry.translate(0, 0.5, 0);
    const targets: THREE.Object3D[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const material = new THREE.MeshStandardMaterial({ color: CLOSED, roughness: 0.6, metalness: 0.02 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((c - (cols - 1) / 2) * STEP, top + 0.012, (r - (rows - 1) / 2) * STEP);
        mesh.scale.y = 0.001;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.index = i;
        stage.scene.add(mesh);
        targets.push(mesh);
        this.columns.push({ mesh, material, height: 0.001, target: 0.001, width: 1, delay: (c + (rows - 1 - r)) * 0.05, open: false, level: 0 });
      }
    }

    // Day names along the right edge and the blocks along the front edge, the two sides nearest the starting view.
    rowLabels.forEach((text, r) => {
      const label = printed(text, 0.3 * print, '#5B4A3E');
      label.position.set(width / 2 + 0.42 + 0.1 * print, top + 0.016, (r - (rows - 1) / 2) * STEP);
      stage.scene.add(label);
    });
    colLabels.forEach((text, c) => {
      if (!text) return;
      const label = printed(text, 0.26 * print, '#8C7A69');
      label.position.set((c - (cols - 1) / 2) * STEP, top + 0.016, depth / 2 + 0.3 + 0.1 * print);
      stage.scene.add(label);
    });

    // One small tag above the busiest block.
    this.tag = document.createElement('span');
    this.tag.className = 'pk-ov-heat-tag';
    stage.scene.add(this.tagAnchor);
    stage.label(this.tag, this.tagAnchor, [0, 0, 0]);

    this.update(input, '');

    stage.setHoverTargets(targets, (object) => {
      this.hovered = object ? (object.userData.index as number) : null;
      this.onHover(this.hovered);
    });
    stage.onSelect(
      (object) => {
        this.hovered = object ? (object.userData.index as number) : null;
        this.onHover(this.hovered);
      },
      (object) => this.columns[object.userData.index as number]?.open ?? false,
    );

    const key = new THREE.DirectionalLight('#FFF6EC', 2.1);
    key.position.set(-5, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, far: 32 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    const rim = new THREE.DirectionalLight('#F3E6D6', 0.6);
    rim.position.set(6, 4, -6);
    const fill = new THREE.HemisphereLight('#FFFFFF', CLINIC_COLORS.sand, 0.65);
    stage.scene.add(key, rim, fill);

    this.unsubscribe = stage.onFrame((time, delta) => this.frame(time, delta));
  }

  /** New values (another location): the columns move to their new heights and colours; `peakText` names the busiest. */
  update(input: HeatInput, peakText: string) {
    const max = Math.max(0.5, ...input.map((c) => c.value));
    this.peak = -1;
    let best = -1;
    input.forEach((cell, i) => {
      const col = this.columns[i];
      if (!col) return;
      col.open = cell.open;
      col.level = cell.open ? cell.value / max : 0;
      col.target = cell.open ? Math.max(0.08, col.level * MAX_HEIGHT) : 0.012;
      if (cell.open && cell.value > best) {
        best = cell.value;
        this.peak = i;
      }
    });
    this.tag.textContent = peakText;
    this.tag.hidden = !peakText || this.peak < 0;
  }

  /** Points at a column from outside, e.g. from the text next to the model. */
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
      const go = still || age > 0.4 + col.delay;
      col.height = still ? col.target : damp(col.height, go ? col.target : 0.001, 5, delta);
      const on = i === this.hovered && col.open;
      col.width = damp(col.width, on ? 1.12 : 1, 10, delta);
      col.mesh.scale.set(col.width, col.height, col.width);
      if (!col.open) color.copy(CLOSED);
      else tone(col.level, color);
      if (on) color.lerp(FOCUS, 0.3);
      col.material.color.copy(color);
    });
    const peak = this.columns[this.peak];
    if (peak) {
      const p = peak.mesh.position;
      this.tagAnchor.position.set(p.x, peak.height + 0.36, p.z);
      // The tag waits until its column has grown, and steps aside while another block is pointed at.
      this.tag.classList.toggle('is-shown', peak.height > peak.target * 0.85 && (this.hovered === null || this.hovered === this.peak));
    }
  }

  /** The number of blocks in a row, for callers that map an index back to a day and a block. */
  get width() {
    return this.cols;
  }
}
