import type { ProductId } from '@pure-clinics/shared';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { damp, type Stage, type Vec } from './stage';

// The stock as one calm shelf on a round turntable: every product is a glass jar, filled as far as there is stock left
// at the chosen clinic (or both together). A product that will be gone within a week is filled in walnut, so it stands
// out without shouting; an empty jar keeps only its walnut base. The short name and the number left are printed flat on
// the plinth in front of each jar, so they turn with it and never float over another jar. It turns all the way round;
// left alone, it turns slowly by itself.

export type ShelfLayout = { camera: Vec; target: Vec; intro: Vec; fitAspect: number; print: number };

export const SHELF_WIDE: ShelfLayout = { camera: [3.6, 4.6, 8.4], target: [0, 0.7, 0.3], intro: [8, 9, 14], fitAspect: 1.5, print: 1 };
export const SHELF_COMPACT: ShelfLayout = { camera: [3.8, 5.4, 9.6], target: [0, 0.75, 0.3], intro: [8, 11, 16], fitAspect: 1.25, print: 1.3 };

export type ShelfItem = { id: ProductId; short: string; name: string };

/** How a jar is filled: units left against what a full shelf holds, and how soon it runs out. */
export type ShelfLevel = { level: number; capacity: number; tone: 'ok' | 'month' | 'week' | 'out' | 'unavailable' };

const PER_ROW = 5;
const STEP_X = 1.32;
const STEP_Z = 1.75;
const JAR = 0.66;
const JAR_H = 1.7;
const FILL = 0.54;
const FONT = "500 88px Jost, 'IBM Plex Sans Arabic', system-ui, sans-serif";

const TONE: Record<ShelfLevel['tone'], THREE.Color> = {
  ok: new THREE.Color('#D8BE9C'),
  month: new THREE.Color('#B48A63'),
  week: new THREE.Color('#6F3A22'),
  out: new THREE.Color('#6F3A22'),
  unavailable: new THREE.Color('#E4D9CA'),
};
const FOCUS = new THREE.Color('#3F3128');

/** A word printed flat on the plinth; its text can change (the number left, another language). */
class Printed {
  readonly mesh: THREE.Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private text = '';

  constructor(
    height: number,
    private readonly color: string,
    chars: number,
  ) {
    this.canvas.height = 128;
    this.canvas.width = Math.ceil(chars * 58 + 40);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry((height * this.canvas.width) / this.canvas.height, height), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 1;
    // The brand font may still be loading; print again once it is there.
    document.fonts?.load(FONT).then(() => this.draw(), () => undefined);
  }

  set(text: string) {
    if (text === this.text) return;
    this.text = text;
    this.draw();
  }

  private draw() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = FONT;
    // A longer word is drawn a little narrower, so it never runs into the next jar's.
    const width = ctx.measureText(this.text).width;
    const room = this.canvas.width - 24;
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2 + 4);
    if (width > room) ctx.scale(room / width, 1);
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
    this.texture.needsUpdate = true;
  }
}

type Jar = {
  id: ProductId;
  group: THREE.Group;
  glass: THREE.Mesh;
  fill: THREE.Mesh;
  fillMaterial: THREE.MeshStandardMaterial;
  base: THREE.MeshStandardMaterial;
  cap: THREE.MeshStandardMaterial;
  count: Printed;
  height: number;
  target: number;
  width: number;
  tone: ShelfLevel['tone'];
  delay: number;
};

export class StockShelf {
  private readonly jars: Jar[] = [];
  private readonly unsubscribe: () => void;
  private readonly tag: HTMLSpanElement;
  private readonly tagAnchor = new THREE.Object3D();
  private hovered: ProductId | null = null;
  private born = -1;
  private texts: Record<string, string> = {};

  constructor(
    private readonly stage: Stage,
    items: ShelfItem[],
    private readonly onHover: (id: ProductId | null) => void,
    onSelect: (id: ProductId) => void,
    print = 1,
  ) {
    const rows = Math.ceil(items.length / PER_ROW);
    const width = PER_ROW * STEP_X;
    const depth = rows * STEP_Z;
    const radius = Math.hypot(width, depth) / 2 + 0.7;

    const cream = new THREE.MeshStandardMaterial({ color: '#FBF7F1', roughness: 0.9 });
    const sand = new THREE.MeshStandardMaterial({ color: '#F1E8DC', roughness: 0.95 });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.06, 0.22, 128), cream);
    plinth.position.y = -0.11;
    plinth.receiveShadow = true;
    const inlay = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.22, radius - 0.22, 0.012, 128), sand);
    inlay.position.y = 0.006;
    inlay.receiveShadow = true;
    stage.scene.add(plinth, inlay);

    const glassGeometry = new RoundedBoxGeometry(JAR, JAR_H, JAR, 4, 0.12);
    glassGeometry.translate(0, JAR_H / 2 + 0.05, 0);
    const fillGeometry = new RoundedBoxGeometry(FILL, 1, FILL, 3, 0.08);
    fillGeometry.translate(0, 0.5, 0);
    const baseGeometry = new RoundedBoxGeometry(JAR + 0.12, 0.06, JAR + 0.12, 2, 0.03);
    const capGeometry = new RoundedBoxGeometry(JAR - 0.12, 0.1, JAR - 0.12, 2, 0.04);

    const targets: THREE.Object3D[] = [];
    items.forEach((item, i) => {
      const row = Math.floor(i / PER_ROW);
      const col = i % PER_ROW;
      const inRow = Math.min(PER_ROW, items.length - row * PER_ROW);
      const x = (col - (inRow - 1) / 2) * STEP_X;
      const z = (row - (rows - 1) / 2) * STEP_Z - 0.25;
      const group = new THREE.Group();
      group.position.set(x, 0.012, z);

      const base = new THREE.MeshStandardMaterial({ color: '#E9DDCC', roughness: 0.8 });
      const pad = new THREE.Mesh(baseGeometry, base);
      pad.position.y = 0.03;
      pad.receiveShadow = true;

      const fillMaterial = new THREE.MeshStandardMaterial({ color: TONE.ok, roughness: 0.55, metalness: 0.02 });
      const fill = new THREE.Mesh(fillGeometry, fillMaterial);
      fill.position.y = 0.1;
      fill.scale.y = 0.001;
      fill.castShadow = true;

      const glass = new THREE.Mesh(
        glassGeometry,
        new THREE.MeshStandardMaterial({ color: '#FFFDF9', transparent: true, opacity: 0.46, roughness: 0.22, metalness: 0, depthWrite: false }),
      );
      glass.renderOrder = 2;
      const capMaterial = new THREE.MeshStandardMaterial({ color: '#E4D9CA', roughness: 0.7 });
      const cap = new THREE.Mesh(capGeometry, capMaterial);
      cap.position.y = JAR_H + 0.1;
      cap.castShadow = true;

      group.add(pad, fill, glass, cap);
      group.userData.id = item.id;
      stage.scene.add(group);
      targets.push(group);

      // The short name and the number left, on the plinth in front of the jar.
      const name = new Printed(0.21 * print, '#7A6857', 13);
      name.set(item.short);
      name.mesh.position.set(x, 0.016, z + JAR / 2 + 0.24 + 0.06 * print);
      const count = new Printed(0.34 * print, '#3F3128', 4);
      count.mesh.position.set(x, 0.016, z + JAR / 2 + 0.56 + 0.16 * print);
      stage.scene.add(name.mesh, count.mesh);

      this.jars.push({ id: item.id, group, glass, fill, fillMaterial, base, cap: capMaterial, count, height: 0.001, target: 0.001, width: 1, tone: 'ok', delay: (col + row) * 0.06 });
    });
    this.texts = Object.fromEntries(items.map((x) => [x.id, x.name]));

    // One small tag above the jar that is pointed at.
    this.tag = document.createElement('span');
    this.tag.className = 'pk-st-shelf-tag';
    stage.scene.add(this.tagAnchor);
    stage.label(this.tag, this.tagAnchor, [0, 0, 0]);

    stage.setHoverTargets(targets, (object) => {
      this.hovered = object ? (object.userData.id as ProductId) : null;
      this.onHover(this.hovered);
    });
    stage.onSelect(
      (object) => {
        if (object) onSelect(object.userData.id as ProductId);
      },
      () => true,
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
    const fill = new THREE.HemisphereLight('#FFFFFF', '#E6D8C4', 0.7);
    stage.scene.add(key, rim, fill);

    this.unsubscribe = stage.onFrame((time, delta) => this.frame(time, delta));
  }

  /** New levels (another clinic, a delivery, a sale): the jars fill or empty to them; `tags` is what the tag says per product. */
  update(levels: Partial<Record<ProductId, ShelfLevel>>, counts: Partial<Record<ProductId, string>>, tags: Partial<Record<ProductId, string>>) {
    for (const jar of this.jars) {
      const l = levels[jar.id];
      if (!l) continue;
      jar.tone = l.tone;
      const share = l.tone === 'unavailable' || l.capacity <= 0 ? 0 : Math.max(0, Math.min(1, l.level / l.capacity));
      jar.target = share > 0 ? Math.max(0.06, share * (JAR_H - 0.16)) : 0.001;
      jar.count.set(counts[jar.id] ?? '');
    }
    this.texts = { ...this.texts, ...tags };
  }

  /** Points at a jar from outside, e.g. from the list next to the model. */
  point(id: ProductId | null) {
    this.hovered = id;
  }

  dispose() {
    this.unsubscribe();
  }

  private frame(time: number, delta: number) {
    if (this.born < 0) this.born = time;
    const age = time - this.born;
    const still = this.stage.reducedMotion;
    const color = new THREE.Color();
    for (const jar of this.jars) {
      const go = still || age > 0.5 + jar.delay;
      jar.height = still ? jar.target : damp(jar.height, go ? jar.target : 0.001, 4.5, delta);
      jar.fill.scale.y = jar.height;
      jar.fill.visible = jar.height > 0.01;
      const on = jar.id === this.hovered;
      jar.width = damp(jar.width, on ? 1.07 : 1, 10, delta);
      jar.group.scale.set(jar.width, 1, jar.width);
      color.copy(TONE[jar.tone]);
      if (on) color.lerp(FOCUS, 0.22);
      jar.fillMaterial.color.copy(color);
      // A jar that is empty or will be within a week gets a walnut cap and base, so it stands out from every side.
      const soon = jar.tone === 'out' || jar.tone === 'week';
      jar.base.color.set(soon ? '#6F3A22' : '#E9DDCC');
      jar.cap.color.set(soon ? '#6F3A22' : '#E4D9CA');
    }
    const pointed = this.jars.find((j) => j.id === this.hovered);
    if (pointed) {
      const p = pointed.group.position;
      this.tagAnchor.position.set(p.x, JAR_H + 0.5, p.z);
      this.tag.textContent = this.texts[pointed.id] ?? '';
    }
    this.tag.classList.toggle('is-shown', Boolean(pointed));
  }
}
