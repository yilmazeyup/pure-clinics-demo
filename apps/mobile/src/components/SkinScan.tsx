import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

import { useI18n } from '@/i18n';
import { PHOTOS } from '@/photos';
import { centroid, levelOf, type Outcome, type Pt, type Signals, type ZoneId } from '@/scan/analyze';
import type { ScanFound, ScanPhoto } from '@/scan/run';
import { useTheme } from '@/theme';

import { Glass } from './Glass';
import { EASE_OUT, prefersReducedMotion, useCountUp } from './Motion';
import { Txt } from './Txt';

// Hand-placed points on the sample face (pc-eyes), in percent of the square photo, for the preview on Home.
const P = {
  foreheadL: [33, 13],
  forehead: [50, 10],
  foreheadR: [67, 13],
  templeL: [13, 30],
  templeR: [88, 30],
  browLo: [17, 24],
  browLi: [36, 25],
  browRi: [63, 25],
  browRo: [84, 26],
  eyeLo: [19, 36],
  eyeLt: [29, 33],
  eyeLi: [37, 39],
  eyeLb: [29, 41],
  eyeRi: [61, 39],
  eyeRt: [70, 33],
  eyeRo: [82, 37],
  eyeRb: [70, 41],
  bridge: [50, 40],
  tip: [50, 62],
  nostrilL: [40, 64],
  nostrilR: [60, 64],
  cheekboneL: [18, 47],
  cheekboneR: [83, 47],
  cheekL: [26, 57],
  cheekR: [75, 57],
  jawL: [15, 68],
  jawR: [87, 68],
  mouthL: [32, 80],
  lipTop: [50, 76],
  mouthR: [66, 80],
  lipBottom: [50, 86],
  jawLowL: [27, 89],
  chin: [50, 96],
  jawLowR: [74, 89],
} as const;
type Point = keyof typeof P;

const MESH: [Point, Point][] = [
  ['foreheadL', 'forehead'], ['forehead', 'foreheadR'], ['templeL', 'foreheadL'], ['foreheadR', 'templeR'],
  ['foreheadL', 'browLi'], ['foreheadR', 'browRi'], ['forehead', 'bridge'],
  ['browLo', 'browLi'], ['browRi', 'browRo'], ['templeL', 'browLo'], ['browRo', 'templeR'],
  ['eyeLo', 'eyeLt'], ['eyeLt', 'eyeLi'], ['eyeLi', 'eyeLb'], ['eyeLb', 'eyeLo'],
  ['eyeRi', 'eyeRt'], ['eyeRt', 'eyeRo'], ['eyeRo', 'eyeRb'], ['eyeRb', 'eyeRi'],
  ['browLi', 'bridge'], ['bridge', 'browRi'], ['eyeLi', 'bridge'], ['bridge', 'eyeRi'],
  ['bridge', 'tip'], ['tip', 'nostrilL'], ['tip', 'nostrilR'], ['eyeLi', 'nostrilL'], ['eyeRi', 'nostrilR'],
  ['eyeLo', 'cheekboneL'], ['eyeRo', 'cheekboneR'], ['cheekboneL', 'cheekL'], ['cheekboneR', 'cheekR'],
  ['cheekL', 'nostrilL'], ['cheekR', 'nostrilR'], ['templeL', 'cheekboneL'], ['templeR', 'cheekboneR'],
  ['cheekboneL', 'jawL'], ['cheekboneR', 'jawR'], ['cheekL', 'mouthL'], ['cheekR', 'mouthR'],
  ['nostrilL', 'lipTop'], ['nostrilR', 'lipTop'], ['mouthL', 'lipTop'], ['lipTop', 'mouthR'], ['mouthL', 'lipBottom'], ['lipBottom', 'mouthR'],
  ['jawL', 'jawLowL'], ['jawLowL', 'chin'], ['chin', 'jawLowR'], ['jawLowR', 'jawR'], ['mouthL', 'jawLowL'], ['mouthR', 'jawLowR'], ['lipBottom', 'chin'],
];


/** The band of light that sweeps down a photo: a glow trailing a bright line. */
function Beam({ width, y }: { width: number; y: Animated.AnimatedInterpolation<number> }) {
  const theme = useTheme();
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, height: 60, transform: [{ translateY: y }] }}>
      <Svg width={width} height={60} viewBox="0 0 100 60" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="scanGlow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.c.gold} stopOpacity={0} />
            <Stop offset="1" stopColor={theme.c.gold} stopOpacity={0.42} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={58} fill="url(#scanGlow)" />
        <Rect x={0} y={58} width={100} height={2} fill="#FFE7B8" />
      </Svg>
    </Animated.View>
  );
}

type PreviewProps = { width: number; height: number };

/** A preview of the skin scan on Home: on Pure's sample photo, the light keeps sweeping and drawing a fine mesh. */
export function SkinScan({ width, height }: PreviewProps & { preview?: boolean }) {
  const theme = useTheme();
  const beam = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (prefersReducedMotion()) {
      beam.setValue(1);
      return;
    }
    const sweep = Animated.timing(beam, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: false });
    const loop = Animated.loop(Animated.sequence([sweep, Animated.delay(900), Animated.timing(beam, { toValue: 0, duration: 0, useNativeDriver: false })]));
    loop.start();
    return () => loop.stop();
  }, [beam]);
  const beamY = beam.interpolate({ inputRange: [0, 1], outputRange: [-60, height] });
  const revealed = beam.interpolate({ inputRange: [0, 1], outputRange: [0, height + 60], extrapolate: 'clamp' });
  return (
    <View style={{ width, height, borderRadius: theme.r.photo, overflow: 'hidden', backgroundColor: theme.c.sand }}>
      <Image source={PHOTOS['pc-eyes']} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(50, 38, 30, 0.12)' }]} />
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: revealed, overflow: 'hidden' }}>
        <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          <G stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={0.22}>
            {MESH.map(([a, b]) => (
              <Line key={`${a}-${b}`} x1={P[a][0]} y1={P[a][1]} x2={P[b][0]} y2={P[b][1]} />
            ))}
          </G>
          <G stroke={theme.c.gold} strokeWidth={0.35} strokeOpacity={0.95}>
            {(Object.keys(P) as Point[]).map((k) => (
              <Path key={k} d={`M ${P[k][0] - 0.9} ${P[k][1]} H ${P[k][0] + 0.9} M ${P[k][0]} ${P[k][1] - 0.9} V ${P[k][1] + 0.9}`} />
            ))}
          </G>
        </Svg>
      </Animated.View>
      <Beam width={width} y={beamY} />
    </View>
  );
}

const SIGNALS: (keyof Signals)[] = ['redness', 'tone', 'blemish', 'shine'];
const SIGNAL_KEY = { redness: 'sigRedness', tone: 'sigTone', blemish: 'sigBlemish', shine: 'sigShine' } as const;
const LEVEL_KEY = { low: 'lvlLow', some: 'lvlSome', clear: 'lvlClear' } as const;
// Only when the face model ran: what the colour measures cannot see.
const FACE_SIGNALS = ['lines', 'eyes', 'texture'] as const;
const FACE_KEY = { lines: 'sigLines', eyes: 'sigEyes', texture: 'sigTexture' } as const;
const ZONE_KEY: Record<'forehead' | 'cheekL' | 'nose' | 'chin', 'zoneForehead' | 'zoneCheeks' | 'zoneNose' | 'zoneChin'> = {
  forehead: 'zoneForehead',
  cheekL: 'zoneCheeks',
  nose: 'zoneNose',
  chin: 'zoneChin',
};
// A few landmarks per region, marked with small crosses like the preview's.
const CROSSES = [10, 151, 9, 168, 6, 197, 4, 1, 2, 0, 17, 18, 200, 152, 234, 454, 93, 323, 132, 361, 58, 288, 50, 280, 205, 425, 117, 346, 108, 337, 69, 299, 33, 263, 133, 362];

type Phase = 'waiting' | 'sweep' | 'done';

/**
 * The real scan on your own photo. While the face is being found, the band of light keeps sweeping; then one last
 * sweep draws the face's contours (from the landmarks on your photo) and the four zones, and a note appears at each
 * zone with what stands out there. The photo is shown like `cover`; every point is mapped the same way.
 */
export function PhotoScan({ photo, result, width, onDone }: { photo: ScanPhoto; result: ScanFound | null; width: number; onDone?: () => void }) {
  const theme = useTheme();
  const height = Math.round(Math.min(Math.max((width * photo.height) / photo.width, width * 0.9), width * 1.35));
  const beam = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<Phase>('waiting');
  const [shown, setShown] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  // Waiting: the light loops. Found: one more sweep, then the notes one by one.
  useEffect(() => {
    if (result) return;
    if (prefersReducedMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beam, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(beam, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beam, result]);
  useEffect(() => {
    if (!result) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = () => {
      setPhase('done');
      [1, 2, 3, 4].forEach((i) => timers.push(setTimeout(() => setShown(i), 260 * (i - 1))));
      timers.push(setTimeout(() => done.current?.(), 260 * 4 + 600));
    };
    if (prefersReducedMotion()) {
      beam.setValue(1);
      finish();
      return () => timers.forEach(clearTimeout);
    }
    setPhase('sweep');
    beam.setValue(0);
    const sweep = Animated.timing(beam, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: false });
    sweep.start(finish);
    return () => {
      sweep.stop();
      timers.forEach(clearTimeout);
    };
  }, [beam, result]);

  const scale = Math.max(width / photo.width, height / photo.height);
  const dx = (width - photo.width * scale) / 2;
  const dy = (height - photo.height * scale) / 2;
  const at = (p: Pt) => ({ x: dx + p.x * photo.width * scale, y: dy + p.y * photo.height * scale });
  const beamY = beam.interpolate({ inputRange: [0, 1], outputRange: [-60, height] });
  const revealed = phase === 'waiting' ? 0 : beam.interpolate({ inputRange: [0, 1], outputRange: [0, height + 60], extrapolate: 'clamp' });

  return (
    <View style={{ width, height, borderRadius: theme.r.photo, overflow: 'hidden', backgroundColor: theme.c.sand }}>
      <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(50, 38, 30, 0.12)' }]} />

      {result ? (
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: revealed, overflow: 'hidden' }}>
          <Svg width={width} height={height}>
            <G stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={0.8}>
              {result.contours.map(([a, b]) => {
                const p = result.landmarks[a];
                const q = result.landmarks[b];
                if (!p || !q) return null;
                const A = at(p);
                const B = at(q);
                return <Line key={`${a}-${b}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} />;
              })}
            </G>
            <G stroke={theme.c.gold} strokeWidth={1.1} strokeOpacity={0.95}>
              {CROSSES.map((i) => {
                const p = result.landmarks[i];
                if (!p) return null;
                const { x, y } = at(p);
                return <Path key={i} d={`M ${x - 3} ${y} H ${x + 3} M ${x} ${y - 3} V ${y + 3}`} />;
              })}
            </G>
            {(Object.entries(result.zones) as [ZoneId, Pt[]][]).map(([zone, poly]) => (
              <Polygon
                key={zone}
                points={poly.map((p) => `${at(p).x},${at(p).y}`).join(' ')}
                fill="#F7F3EC"
                fillOpacity={0.12}
                stroke="#F7F3EC"
                strokeOpacity={0.9}
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
            ))}
          </Svg>
        </Animated.View>
      ) : null}

      <Beam width={width} y={beamY} />

      {result && phase === 'done'
        ? (['forehead', 'cheekL', 'nose', 'chin'] as const).slice(0, shown).map((zone) => {
            const c = at(centroid(result.zones[zone]));
            const chipWidth = 150;
            const left = Math.max(8, Math.min(width - chipWidth - 8, c.x - chipWidth / 2));
            const top = Math.max(8, Math.min(height - 36, c.y - 14));
            return <ZoneNote key={zone} zone={zone} outcome={result.outcome} left={left} top={top} width={chipWidth} />;
          })
        : null}
    </View>
  );
}

/** What stands out most in a zone, in a few words: "Wangen · roodheid een beetje", or "Kin · rustig". */
function ZoneNote({ zone, outcome, left, top, width }: { zone: 'forehead' | 'cheekL' | 'nose' | 'chin'; outcome: Outcome; left: number; top: number; width: number }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const values = zone === 'cheekL' ? avgSignals(outcome.zones.cheekL, outcome.zones.cheekR) : outcome.zones[zone];
  const top1 = SIGNALS.map((k) => [k, values[k]] as const).sort((a, b) => b[1] - a[1])[0];
  const label =
    top1 && top1[1] >= 0.3
      ? `${t(ZONE_KEY[zone])} · ${t(SIGNAL_KEY[top1[0]]).toLocaleLowerCase(locale)} ${t(LEVEL_KEY[levelOf(top1[1])])}`
      : `${t(ZONE_KEY[zone])} · ${t('zoneCalm')}`;
  const pop = useRef(new Animated.Value(prefersReducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, speed: 14, bounciness: 9, useNativeDriver: false }).start();
  }, [pop]);
  return (
    <Animated.View style={{ position: 'absolute', left, top, width, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}>
      <Glass style={{ borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, alignSelf: 'center' }}>
        <Txt variant="caption" numberOfLines={1} style={{ fontFamily: theme.f.medium, fontSize: 11 }}>
          {label}
        </Txt>
      </Glass>
    </Animated.View>
  );
}

const avgSignals = (a: Signals, b: Signals): Signals => ({
  redness: (a.redness + b.redness) / 2,
  tone: (a.tone + b.tone) / 2,
  blemish: (a.blemish + b.blemish) / 2,
  shine: (a.shine + b.shine) / 2,
});

/** What the photo shows, per signal, as bars that fill up with a plain word beside them; never a score or a verdict. */
export function ScanSignals({ outcome }: { outcome: Outcome }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, padding: 18, gap: 16, boxShadow: theme.shadow.card }}>
      {SIGNALS.map((key, index) => (
        <Bar key={key} label={t(SIGNAL_KEY[key])} value={outcome.overall[key]} word={t(LEVEL_KEY[levelOf(outcome.overall[key])])} delay={200 + index * 120} />
      ))}
      {FACE_SIGNALS.filter((key) => typeof outcome.face?.[key] === 'number').map((key, index) => {
        const value = outcome.face?.[key] ?? 0;
        return (
          <Bar key={key} label={t(FACE_KEY[key])} value={value} word={t(LEVEL_KEY[levelOf(value)])} delay={200 + (SIGNALS.length + index) * 120} />
        );
      })}
      {outcome.light < 35 ? (
        <Txt variant="small" color={theme.c.muted}>
          {t('scanDark')}
        </Txt>
      ) : null}
    </View>
  );
}

function Bar({ label, value, word, delay }: { label: string; value: number; word: string; delay: number }) {
  const theme = useTheme();
  const fill = useRef(new Animated.Value(prefersReducedMotion() ? 1 : 0)).current;
  // A sliver stays visible at "hardly any", so the bar reads as measured rather than empty.
  const shown = Math.round(Math.max(0.06, value) * 100);
  const counted = useCountUp(1, { duration: 900, delay });
  useEffect(() => {
    Animated.timing(fill, { toValue: 1, duration: 1100, delay, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [fill, delay]);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Txt variant="smallStrong">{label}</Txt>
        <Txt variant="small" color={theme.c.muted} style={{ opacity: counted }}>
          {word}
        </Txt>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.c.line, overflow: 'hidden' }}>
        <Animated.View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: value >= 0.65 ? theme.c.primary : value >= 0.3 ? theme.c.gold : theme.c.lineStrong,
            width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${shown}%`] }),
          }}
        />
      </View>
    </View>
  );
}
