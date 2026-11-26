import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { View } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';

import { useI18n } from '@/i18n';
import { photoFrom, toCanvas, type ScanPhoto } from '@/scan/run';
import { useTheme } from '@/theme';

import { Button } from './Button';
import { Icon } from './Icon';
import { Notice } from './Notice';
import { Txt } from './Txt';

type Mode = 'idle' | 'starting' | 'live' | 'denied';

/**
 * The selfie for the skin scan, in the browser: the front camera (getUserMedia) with an oval to put your face in, or a
 * photo you choose. The picture is drawn onto a canvas in this page and handed on; it is never uploaded.
 */
export function FaceCapture({ width, onPhoto }: { width: number; onPhoto: (photo: ScanPhoto) => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('idle');
  const [badFile, setBadFile] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const height = Math.round(width * 1.25);

  const stop = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };
  useEffect(() => stop, []);

  const open = async () => {
    setBadFile(false);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return setMode('denied');
    setMode('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      setMode('live');
    } catch {
      setMode('denied');
    }
  };

  useEffect(() => {
    if (mode !== 'live' || !video.current || !stream.current) return;
    video.current.srcObject = stream.current;
    video.current.play().catch(() => {});
  }, [mode]);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    // Mirrored, like the preview: the photo looks the way you saw yourself.
    const canvas = toCanvas(v, v.videoWidth, v.videoHeight, { mirror: true });
    stop();
    setMode('idle');
    onPhoto(photoFrom(canvas));
  };

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    if (!chosen) return;
    const url = URL.createObjectURL(chosen);
    const img = new Image();
    img.onload = () => {
      const canvas = toCanvas(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      stop();
      setMode('idle');
      onPhoto(photoFrom(canvas));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setBadFile(true);
    };
    img.src = url;
  };

  const corner = { position: 'absolute' as const, width: 28, height: 28, borderColor: mode === 'live' ? '#F7F3EC' : theme.c.ink };
  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignSelf: 'center', width, height, borderRadius: theme.r.card, backgroundColor: theme.c.sand, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {mode === 'live' ? (
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
        ) : (
          <Icon name="camera" size={30} color={theme.c.muted} />
        )}
        {mode === 'live' ? (
          <Svg style={{ position: 'absolute', top: 0, left: 0 }} width={width} height={height} pointerEvents="none">
            <Ellipse cx={width / 2} cy={height * 0.47} rx={width * 0.3} ry={height * 0.33} fill="none" stroke="#F7F3EC" strokeOpacity={0.85} strokeWidth={1.5} strokeDasharray="6 5" />
          </Svg>
        ) : null}
        <View style={{ ...corner, top: 16, left: 16, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 6 }} />
        <View style={{ ...corner, top: 16, right: 16, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 6 }} />
        <View style={{ ...corner, bottom: 16, left: 16, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 6 }} />
        <View style={{ ...corner, bottom: 16, right: 16, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 6 }} />
      </View>

      {mode === 'denied' ? <Notice text={t('scanNoCamera')} /> : null}
      {badFile ? <Notice text={t('scanNoFace')} /> : null}

      {mode === 'live' ? (
        <View style={{ gap: 10 }}>
          <Button icon="camera" label={t('scanCapture')} onPress={capture} />
          <Button
            kind="quiet"
            label={t('common.back')}
            onPress={() => {
              stop();
              setMode('idle');
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Button icon="camera" label={t('scanCamera')} disabled={mode === 'starting'} onPress={open} />
          <Button kind="secondary" label={t('scanUpload')} onPress={() => file.current?.click()} />
        </View>
      )}
      <input ref={file} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} aria-hidden />

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Icon name="lock" size={15} color={theme.c.muted} />
        <Txt variant="small" color={theme.c.muted} style={{ flex: 1 }}>
          {t('scanPrivacy')}
        </Txt>
      </View>
    </View>
  );
}

export const FACE_SCAN_AVAILABLE = true;
