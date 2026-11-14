import { useRef, type ReactNode } from 'react';

import { useI18n, type MessageKey } from '../../../i18n';
import { PkIcon } from '../../icons';
import { Field } from '../../kit';
import './template.css';

// Placeholders a clinic types into a message, the way SkinAdmin and most mail tools write them. They are system
// tokens: the same in every language, filled in with the client's details when a message goes out.

export const TOKENS = ['voornaam', 'voorletters', 'tussenvoegsel', 'achternaam', 'datum', 'tijd', 'behandeling', 'locatie', 'specialist', 'link'] as const;
export type Token = (typeof TOKENS)[number];

export const token = (name: Token) => `{${name}}`;

/** The arguments that put tokens into a translated default text: t(key, TOKEN_ARGS) turns {name} into {voornaam}. */
export const TOKEN_ARGS = {
  name: token('voornaam'),
  date: token('datum'),
  time: token('tijd'),
  treatment: token('behandeling'),
  location: token('locatie'),
  specialist: token('specialist'),
  link: token('link'),
};

/** Replaces every token in a text with sample or real values. */
export function fill(text: string, values: Partial<Record<Token, string>>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => values[name as Token] ?? match);
}

/** Puts `insert` at the textarea's cursor (or at the end) and returns the new text. */
export function insertAt(area: HTMLTextAreaElement | HTMLInputElement | null, text: string, insert: string): string {
  if (!area || area.selectionStart === null) return text + insert;
  const start = area.selectionStart;
  const end = area.selectionEnd ?? start;
  const next = text.slice(0, start) + insert + text.slice(end);
  window.requestAnimationFrame(() => {
    area.focus();
    area.setSelectionRange(start + insert.length, start + insert.length);
  });
  return next;
}

/** Chips that insert a token at the cursor of the field that was used last. */
export function TokenChips({ tokens, onInsert }: { tokens: readonly Token[]; onInsert: (token: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="pk-me-tokens">
      <span className="pk-field-label">{t('pk.berichten.tokens')}</span>
      <div className="pk-me-token-row">
        {tokens.map((name) => (
          <button
            key={name}
            type="button"
            className="pk-me-token"
            title={t(`pk.berichten.token.${name}` as MessageKey)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(token(name))}
          >
            {token(name)}
          </button>
        ))}
      </div>
      <small className="pk-field-hint">{t('pk.berichten.tokensHint')}</small>
    </div>
  );
}

export type Channel = 'email' | 'sms' | 'whatsapp';

type EditorProps = {
  channel: Channel;
  subject?: string;
  body: string;
  onSubject?: (value: string) => void;
  onBody: (value: string) => void;
  tokens: readonly Token[];
  sample: Partial<Record<Token, string>>;
  sampleName: string;
  onReset?: () => void;
  /** Extra lines under the preview, e.g. the unsubscribe link. */
  footer?: ReactNode;
};

/** Subject and text with insertable tokens on one side, the message as the client receives it on the other. */
export function TemplateEditor({ channel, subject, body, onSubject, onBody, tokens, sample, sampleName, onReset, footer }: EditorProps) {
  const { t } = useI18n();
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const last = useRef<'subject' | 'body'>('body');
  const filled = fill(body, sample);
  const smsLength = filled.length;

  const insert = (value: string) => {
    if (last.current === 'subject' && onSubject && subject !== undefined) onSubject(insertAt(subjectRef.current, subject, value));
    else onBody(insertAt(bodyRef.current, body, value));
  };

  return (
    <div className="pk-me-editor">
      <div className="pk-stack">
        {subject !== undefined && onSubject ? (
          <Field label={t('pk.berichten.subject')}>
            <input
              ref={subjectRef}
              className="pk-input"
              value={subject}
              onFocus={() => (last.current = 'subject')}
              onChange={(e) => onSubject(e.target.value)}
            />
          </Field>
        ) : null}
        <Field label={t('pk.berichten.body')}>
          <textarea
            ref={bodyRef}
            className="pk-input pk-me-body"
            rows={channel === 'email' ? 10 : 5}
            value={body}
            onFocus={() => (last.current = 'body')}
            onChange={(e) => onBody(e.target.value)}
          />
        </Field>
        <TokenChips tokens={tokens} onInsert={insert} />
        {onReset ? (
          <div>
            <button type="button" className="btn btn-ghost btn-small" onClick={onReset}>
              <PkIcon name="undo" size={15} />
              {t('pk.berichten.resetTpl')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="pk-me-preview" aria-label={t('pk.berichten.preview')}>
        <span className="eyebrow">{t('pk.berichten.previewWith', { name: sampleName })}</span>
        {channel === 'email' ? (
          <div className="pk-me-mail">
            <div className="pk-me-mail-head">
              <span>
                {t('pk.berichten.from')} <b>Pure Clinics</b>
              </span>
              {subject !== undefined ? <strong>{fill(subject, sample)}</strong> : null}
            </div>
            <div className="pk-me-mail-body">
              {filled.split('\n\n').map((para, i) => (
                <p key={i}>
                  {para.split('\n').map((line, j) => (
                    <span key={j}>
                      {j ? <br /> : null}
                      {line}
                    </span>
                  ))}
                </p>
              ))}
            </div>
            {footer}
          </div>
        ) : (
          <div className={`pk-me-bubble-wrap pk-me-bubble-wrap--${channel}`}>
            <div className="pk-me-bubble">
              <span className="pk-me-bubble-from">
                <PkIcon name={channel === 'whatsapp' ? 'whatsapp' : 'sms'} size={14} />
                Pure Clinics
              </span>
              {filled}
            </div>
            {channel === 'sms' ? (
              <small className="pk-muted pk-small">{t('pk.berichten.chars', { n: smsLength, parts: Math.max(1, Math.ceil(smsLength / 160)) })}</small>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
