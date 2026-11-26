import type { ScanPhoto } from '@/scan/run';

/**
 * The selfie for the skin scan runs in the browser (FaceCapture.web.tsx). A phone build has no camera module
 * installed, so there the advice is made from the answers alone and this step is left out (see advies.tsx).
 */
export function FaceCapture(_props: { width: number; onPhoto: (photo: ScanPhoto) => void }) {
  return null;
}

export const FACE_SCAN_AVAILABLE = false;
