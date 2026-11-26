// Behandelingen: the reel of treatment rooms, every treatment in a short index, and the skin layers.
import { effects, rooms, treatmentIndex } from '../parts.js';

export function start() {
  rooms();
  treatmentIndex();
  effects();
}
