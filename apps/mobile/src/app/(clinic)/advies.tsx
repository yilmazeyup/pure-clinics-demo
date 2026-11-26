import {
  CONCERNS,
  CLINIC_COLORS,
  inSentence,
  treatmentById,
  type ConcernId,
  type Treatment,
  type TreatmentId,
} from '@pure-clinics/shared';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { Badge } from '@/components/Badge';
import { Button, IconButton } from '@/components/Button';
import { FACE_SCAN_AVAILABLE, FaceCapture } from '@/components/FaceCapture';
import { Icon } from '@/components/Icon';
import { Notice } from '@/components/Notice';
import { Photo } from '@/components/Photo';
import { FadeIn } from '@/components/Motion';
import { Footer, Screen, useModalTop } from '@/components/Screen';
import { PhotoScan, ScanSignals } from '@/components/SkinScan';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import type { Outcome } from '@/scan/analyze';
import { loadFaceFinder, scanPhoto, type ScanFound, type ScanPhoto } from '@/scan/run';
import { useTheme } from '@/theme';

type Skin = 'calm' | 'sensitive' | 'reactive';
const SKINS: Skin[] = ['calm', 'sensitive', 'reactive'];
// Three questions and, in the browser, a selfie; a phone build has no camera module, so there it is three questions.
const QUESTIONS = FACE_SCAN_AVAILABLE ? 4 : 3;
// Treatments that can irritate skin that reddens easily; the skin therapist decides at the intake.
const NOT_FOR_REACTIVE: TreatmentId[] = ['tca', 'skinpen', 'tixel'];

/** What the photo suggests looking at, from the scan's signals (see scan/analyze.ts); the intake decides. */
function concernsFromScan(outcome: Outcome): ConcernId[] {
  const found: ConcernId[] = [];
  if (outcome.overall.redness >= 0.6) found.push('redness');
  if (outcome.overall.tone >= 0.35) found.push('pigment');
  if (outcome.overall.blemish >= 0.45) found.push('acne');
  return found;
}

type ScanState = 'capture' | 'working' | 'done' | 'no-face' | 'unavailable';

/** Three questions and an optional selfie scan, then the free intake and a short list of treatments. */
export default function AdviceScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [concerns, setConcerns] = useState<ConcernId[]>([]);
  const [skin, setSkin] = useState<Skin | null>(null);
  const [treatedBefore, setTreatedBefore] = useState<boolean | null>(null);
  // The selfie step: take or choose a photo, find the face and measure it on the device, then show what it shows.
  const [scan, setScan] = useState<ScanState>('capture');
  const [photo, setPhoto] = useState<ScanPhoto | null>(null);
  const [found, setFound] = useState<ScanFound | null>(null);
  const round = useRef(0);
  const top = useModalTop();
  const { width } = useWindowDimensions();
  const scanWidth = Math.min(width - 40, 420);

  const answered = [concerns.length > 0, skin !== null, treatedBefore !== null, true][step] ?? true;
  const next = () => setStep((s) => s + 1);
  const result = step >= QUESTIONS;

  // Start fetching the face finder as soon as the photo step is near, so the scan itself is quick.
  useEffect(() => {
    if (FACE_SCAN_AVAILABLE && step >= 2) loadFaceFinder().catch(() => {});
  }, [step]);

  const onPhoto = (taken: ScanPhoto) => {
    const mine = ++round.current;
    setPhoto(taken);
    setFound(null);
    setScan('working');
    scanPhoto(taken).then((r) => {
      if (mine !== round.current) return;
      if (r.kind === 'found') setFound(r);
      else setScan(r.kind);
    });
  };
  const retake = () => {
    round.current++;
    setPhoto(null);
    setFound(null);
    setScan('capture');
  };

  const footer =
    step < 3 ? (
      <Footer>
        <Button label={t('clinic.ai.next')} disabled={!answered} iconAfter="arrow" onPress={next} />
      </Footer>
    ) : step === 3 ? (
      scan === 'working' ? null : scan === 'done' ? (
        <Footer>
          <Button label={t('clinic.scan.continue')} iconAfter="arrow" onPress={next} />
          <Button kind="quiet" label={t('scanRetake')} onPress={retake} />
        </Footer>
      ) : scan === 'unavailable' ? (
        <Footer>
          <Button label={t('clinic.ai.next')} iconAfter="arrow" onPress={next} />
        </Footer>
      ) : (
        <Footer>
          <Button kind="quiet" label={t('clinic.ai.skip')} onPress={next} />
        </Footer>
      )
    ) : (
      <Footer>
        <Button label={t('clinic.home.consultCta')} onPress={() => router.replace('/afspraak/consult')} />
      </Footer>
    );

  return (
    <Screen gap={22} footer={footer} sheet contentStyle={{ paddingTop: top }}>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {step > 0 && !result ? (
            <IconButton icon="back" label={t('common.back')} tone="surface" onPress={() => setStep((s) => s - 1)} />
          ) : null}
          <View style={{ flex: 1 }}>
            <Txt variant="eyebrow" color={theme.c.muted}>
              {t('clinic.ai.title')}
            </Txt>
            {!result ? (
              <Txt variant="small" color={theme.c.muted}>
                {t('clinic.ai.step', { n: step + 1 })}
              </Txt>
            ) : null}
          </View>
          <IconButton icon="close" label={t('common.close')} tone="surface" onPress={() => router.back()} />
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {Array.from({ length: QUESTIONS }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= step ? theme.c.primary : theme.c.line }} />
          ))}
        </View>
      </View>

      {step === 0 ? (
        <Question title={t('clinic.ai.q1')} hint={t('clinic.ai.q1Hint')}>
          {CONCERNS.map((c) => {
            const on = concerns.includes(c.id);
            return (
              <Option
                key={c.id}
                label={t(`clinic.concern.${c.id}`)}
                selected={on}
                multi
                leading={<Photo photo={c.photo} style={{ width: 48, height: 56, borderRadius: theme.r.small }} />}
                onPress={() => setConcerns((list) => (on ? list.filter((x) => x !== c.id) : [...list, c.id]))}
              />
            );
          })}
        </Question>
      ) : null}

      {step === 1 ? (
        <Question title={t('clinic.ai.q2')}>
          {SKINS.map((s) => (
            <Option key={s} label={t(`clinic.ai.skin.${s}`)} selected={skin === s} onPress={() => setSkin(s)} />
          ))}
        </Question>
      ) : null}

      {step === 2 ? (
        <Question title={t('clinic.ai.q3')}>
          <Option label={t('clinic.ai.yes')} selected={treatedBefore === true} onPress={() => setTreatedBefore(true)} />
          <Option label={t('clinic.ai.no')} selected={treatedBefore === false} onPress={() => setTreatedBefore(false)} />
        </Question>
      ) : null}

      {step === 3 && scan === 'capture' ? (
        <Question title={t('clinic.ai.q4')} hint={t('scanHint')}>
          <FaceCapture width={Math.min(scanWidth, 300)} onPhoto={onPhoto} />
        </Question>
      ) : null}

      {step === 3 && scan === 'no-face' ? (
        <View style={{ gap: 16 }}>
          <Txt variant="display">{t('clinic.ai.q4')}</Txt>
          <Notice text={t('scanNoFace')} />
          <Button icon="camera" label={t('scanRetake')} onPress={retake} />
        </View>
      ) : null}

      {step === 3 && scan === 'unavailable' ? (
        <View style={{ gap: 16 }}>
          <Txt variant="display">{t('clinic.ai.q4')}</Txt>
          <Notice text={t('scanUnavailable')} />
        </View>
      ) : null}

      {step === 3 && (scan === 'working' || scan === 'done') && photo ? (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Txt variant="display">{scan === 'done' ? t('scanResultTitle') : t('scanLooking')}</Txt>
            <Txt variant="body" color={theme.c.muted}>
              {scan === 'done' ? t('scanResultBody') : found ? t('scanPrivacy') : t('scanPreparing')}
            </Txt>
          </View>
          <View style={{ alignSelf: 'center' }}>
            <PhotoScan photo={photo} result={found} width={scanWidth} onDone={() => setScan('done')} />
          </View>
          {scan === 'done' && found ? (
            <FadeIn>
              <ScanSignals outcome={found.outcome} />
            </FadeIn>
          ) : null}
        </View>
      ) : null}

      {result ? (
        <Advice concerns={concerns} fromPhoto={scan === 'done' && found ? concernsFromScan(found.outcome) : []} skin={skin} />
      ) : null}
    </Screen>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <Txt variant="display">{title}</Txt>
        {hint ? (
          <Txt variant="body" color={theme.c.muted}>
            {hint}
          </Txt>
        ) : null}
      </View>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function Option({
  label,
  selected,
  onPress,
  multi,
  leading,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
  leading?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 60,
        padding: leading ? 8 : 16,
        paddingEnd: 16,
        borderRadius: theme.r.control,
        backgroundColor: theme.c.surface,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? theme.c.ink : theme.c.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {leading}
      <Txt variant="bodyStrong" style={{ flex: 1 }}>
        {label}
      </Txt>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          borderWidth: selected ? 0 : 1.5,
          borderColor: theme.c.lineStrong,
          backgroundColor: selected ? theme.c.ink : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Icon name="check" size={14} color={theme.c.onPrimary} strokeWidth={2.4} /> : null}
      </View>
    </Pressable>
  );
}

/** The free intake first, always; then up to three treatments for what you chose and what the photo showed. */
function Advice({ concerns, fromPhoto, skin }: { concerns: ConcernId[]; fromPhoto: ConcernId[]; skin: Skin | null }) {
  const theme = useTheme();
  const { t, text, euro, locale } = useI18n();
  const picks: { treatment: Treatment; concern: ConcernId; photo: boolean }[] = [];
  const all = [...concerns, ...fromPhoto.filter((c) => !concerns.includes(c))];
  for (const concern of all) {
    for (const id of CONCERNS.find((c) => c.id === concern)?.treatments ?? []) {
      if (skin === 'reactive' && NOT_FOR_REACTIVE.includes(id)) continue;
      if (!picks.some((p) => p.treatment.id === id)) picks.push({ treatment: treatmentById(id), concern, photo: !concerns.includes(concern) });
    }
  }
  const consult = treatmentById('consult');

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <Txt variant="display">{t('clinic.ai.resultTitle')}</Txt>
        <Txt variant="body" color={theme.c.muted}>
          {t('clinic.ai.resultBody')}
        </Txt>
      </View>

      <Recommendation treatment={consult} note={text(consult.description)} badge={t('clinic.book.startHere')} />
      {picks.slice(0, 3).map(({ treatment, concern, photo }) => (
        <Recommendation
          key={treatment.id}
          treatment={treatment}
          badge={photo ? t('scanFound') : undefined}
          tone={photo ? 'outline' : 'ink'}
          note={`${t('clinic.ai.match', { concern: inSentence(t(`clinic.concern.${concern}`), locale) })} · ${t('clinic.price.from', { price: euro(treatment.priceFrom) })}`}
        />
      ))}

      <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: theme.r.control, backgroundColor: theme.c.sand }}>
        <Icon name="leaf" size={18} color={theme.c.primary} />
        <Txt variant="small" color={CLINIC_COLORS.body} style={{ flex: 1 }}>
          {t('clinic.ai.disclaimer')}
        </Txt>
      </View>
    </View>
  );
}

function Recommendation({ treatment, note, badge, tone = 'ink' }: { treatment: Treatment; note: string; badge?: string; tone?: 'ink' | 'outline' }) {
  const theme = useTheme();
  const { text } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.replace({ pathname: '/behandeling/[id]', params: { id: treatment.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 10,
        borderRadius: theme.r.card,
        backgroundColor: theme.c.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Photo photo={treatment.photo} style={{ width: 72, height: 88, borderRadius: theme.r.small }} />
      <View style={{ flex: 1, gap: 4 }}>
        {badge ? <Badge label={badge} tone={tone} /> : null}
        <Txt variant="heading">{text(treatment.name)}</Txt>
        <Txt variant="small" color={theme.c.muted}>
          {note}
        </Txt>
      </View>
      <Icon name="chevron" size={18} color={theme.c.muted} />
    </Pressable>
  );
}
