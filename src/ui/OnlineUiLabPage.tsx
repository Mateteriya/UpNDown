/**
 * Лаборатория: онлайн-UI «Стандарт после short» без Supabase (dev-only URL, см. main.tsx).
 * Реальный TableChatDock с offlineUiLab — те же классы и скролл, что у игрового стола.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TableChatDock, type OfflineUiLabEarMock } from './TableChatDock';

const LAB_ROOM_ID = '00000000-0000-0000-0000-000000000001';
const LAB_USER_ID = '00000000-0000-0000-0000-000000000002';

/** Длинное превью по умолчанию на лаб-странице (формат «Имя: текст» — как в `parseUnreadPhantomDemoLine`). */
const LAB_DEFAULT_LONG_UNREAD_PREVIEW =
  'Маша: ОЧЕНЬ_ДЛИНОЕ_ПРЕВЬЮ для /online-ui-lab — проверка переносов во фантоме и «…». ' +
  'Три строки line-clamp, затем если текст ещё длиннее — обрезка по символам в самом чате не применяется здесь: видно всё, что вы вставите. ' +
  'Повтор для ширины: АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ0123456789абвгдеёжзийклмнопрстуфхцчшщъыьэюя___ ' +
  'English: the quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. ' +
  'Снова кириллица 9876543210 и латиница ZYXWVUTSRQPONMLKJIHGFEDCBA до края строки. ' +
  'Ещё один абзац одной строкой: сиреневый стол, серебристый блик, голубое небо — просто слова, чтобы заполнить пузырь и увидеть, как он ведёт себя у ушка.';

interface OnlineUiLabPageProps {
  onBack: () => void;
}

type EarDemoScenario = 'none' | 'typing' | 'unread';

export function OnlineUiLabPage({ onBack }: OnlineUiLabPageProps) {
  const [standardAfterShort, setStandardAfterShort] = useState(true);
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [earDemoScenario, setEarDemoScenario] = useState<EarDemoScenario>('none');
  const [earDemoTypingLine, setEarDemoTypingLine] = useState('Маша печатает…');
  const [earDemoUnreadPreview, setEarDemoUnreadPreview] = useState(LAB_DEFAULT_LONG_UNREAD_PREVIEW);
  /** Лаба: имитация входящего сообщения (увеличивается при каждом клике — см. TableChatDock offlineUiLabIncomingSeq). */
  const [labIncomingSeq, setLabIncomingSeq] = useState(0);

  useEffect(() => {
    if (earDemoScenario !== 'unread') setLabIncomingSeq(0);
  }, [earDemoScenario]);

  const onMobileChatCollapsedChange = useCallback((collapsed: boolean) => {
    setChatCollapsed(collapsed);
  }, []);

  const offlineUiLabEarMock = useMemo<OfflineUiLabEarMock>(() => {
    if (earDemoScenario === 'none') return { scenario: 'none' };
    if (earDemoScenario === 'typing') return { scenario: 'typing', line: earDemoTypingLine };
    return { scenario: 'unread', preview: earDemoUnreadPreview };
  }, [earDemoScenario, earDemoTypingLine, earDemoUnreadPreview]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#0b1220',
        color: '#f8fafc',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Верх: навигация + режим */}
      <div
        style={{
          flexShrink: 0,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          borderBottom: '1px solid rgba(51, 65, 85, 0.6)',
          background: '#0f172a',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid rgba(94, 234, 212, 0.35)',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          ← В приложение
        </button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Просмотр: моб. чат «после short»</span>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginLeft: 'auto',
            fontSize: 13,
            color: '#cbd5e1',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={standardAfterShort}
            onChange={(e) => setStandardAfterShort(e.target.checked)}
          />
          Режим «Стандарт после short»
        </label>
      </div>

      {/* Демо ушка без онлайна: URL тот же — /online-ui-lab */}
      <div
        style={{
          flexShrink: 0,
          padding: '10px 14px',
          fontSize: 13,
          lineHeight: 1.5,
          borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
          background: 'rgba(15, 23, 42, 0.75)',
          color: '#cbd5e1',
        }}
      >
        <strong style={{ color: '#a5f3fc' }}>Ушко (без Supabase):</strong>{' '}
        <span style={{ opacity: 0.92 }}>
          чат должен быть <strong style={{ color: '#e2e8f0' }}>свёрнут</strong>, чтобы были фантом и точка. Если ушко свернуть в{' '}
          <strong style={{ color: '#e2e8f0' }}>узкую полоску</strong>, фантом «печатает» скрывается (как в игре).
        </span>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {(
            [
              ['none', 'как в игре (пусто)'],
              ['typing', '«печатает» + фантом'],
              ['unread', 'непрочитанное + точка + фантом'],
            ] as const
          ).map(([id, label]) => (
            <label
              key={id}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
            >
              <input
                type="radio"
                name="ear-demo"
                checked={earDemoScenario === id}
                onChange={() => setEarDemoScenario(id)}
              />
              {label}
            </label>
          ))}
        </div>
        {earDemoScenario === 'typing' ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, maxWidth: 420 }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>Текст во фантоме</span>
            <input
              value={earDemoTypingLine}
              onChange={(e) => setEarDemoTypingLine(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid rgba(51, 65, 85, 0.9)',
                background: 'rgba(2, 6, 23, 0.55)',
                color: '#f1f5f9',
                fontSize: 13,
              }}
            />
          </label>
        ) : null}
        {earDemoScenario === 'unread' ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, maxWidth: 'min(720px, 96vw)' }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>
              Превью во фантоме (и точка на ушке). Формат: <code style={{ fontSize: 11 }}>Имя: текст</code> — до двоеточия с пробелом
              пойдёт имя автора.
            </span>
            <textarea
              value={earDemoUnreadPreview}
              onChange={(e) => setEarDemoUnreadPreview(e.target.value)}
              rows={5}
              spellCheck={false}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgba(51, 65, 85, 0.9)',
                background: 'rgba(2, 6, 23, 0.55)',
                color: '#f1f5f9',
                fontSize: 13,
                lineHeight: 1.45,
                resize: 'vertical',
                width: '100%',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                disabled={!standardAfterShort || !chatCollapsed}
                onClick={() => setLabIncomingSeq((n) => n + 1)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(56, 189, 248, 0.55)',
                  background:
                    !standardAfterShort || !chatCollapsed
                      ? 'rgba(30, 41, 59, 0.5)'
                      : 'rgba(14, 116, 144, 0.45)',
                  color: !standardAfterShort || !chatCollapsed ? '#64748b' : '#ecfeff',
                  cursor: !standardAfterShort || !chatCollapsed ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Имитировать новое сообщение в чат
              </button>
              <span style={{ fontSize: 11, opacity: 0.88, maxWidth: 'min(520px, 92vw)', lineHeight: 1.45 }}>
                Проверка «пишу ответ во фантоме — пришло новое»: сверните чат, сценарий «непрочитанное», откройте ↩ и наберите
                текст; затем нажмите кнопку — превью ушка обновится, черновик не сотрётся (имитаций:{' '}
                <strong style={{ color: '#e2e8f0' }}>{labIncomingSeq}</strong>
                ). Нужны режим «Стандарт после short» и свёрнутый чат.
              </span>
            </div>
          </label>
        ) : null}
      </div>

      {/* Статус: что сейчас с ушком / чатом — не уезжает при скролле внутри макета */}
      <div
        style={{
          flexShrink: 0,
          padding: '10px 14px',
          fontSize: 13,
          lineHeight: 1.5,
          borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
          background: chatCollapsed ? 'rgba(30, 58, 95, 0.35)' : 'rgba(120, 53, 15, 0.45)',
          color: chatCollapsed ? '#e2e8f0' : '#ffedd5',
        }}
        role="status"
      >
        {chatCollapsed ? (
          <>
            <strong style={{ color: '#7dd3fc' }}>Сейчас: чат свёрнут.</strong> Справа — «ушко» 💬; крестик под «Чат» — космический шарик (можно таскать по экрану, у края
            прилипает); в фантоме — «В ЧАТ» к панели внизу.
            <br />
            <span style={{ opacity: 0.9 }}>
              Нажмите глиф или «Чат» на ушке — прокрутка к панели внизу и сворачивание ушка в рельсу (ушко остаётся у края).
            </span>
          </>
        ) : (
          <>
            <strong style={{ color: '#fdba74' }}>Сейчас: чат открыт.</strong> Ушко скрыто специально — так же в настоящей онлайн-игре: пока чат
            развёрнут, видна только панель «Чат стола».
            <br />
            <span style={{ fontWeight: 600 }}>
              Чтобы снова увидеть ушко и кнопку «Чат» внизу — нажмите «Свернуть» в правом верхнем углу серой панели чата (рядом с заголовком «Чат
              стола»).
            </span>
          </>
        )}
      </div>

      {/* Краткая памятка */}
      <details
        style={{
          flexShrink: 0,
          padding: '6px 14px 10px',
          fontSize: 12,
          color: '#94a3b8',
          borderBottom: '1px solid rgba(51, 65, 85, 0.35)',
        }}
      >
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#cbd5e1' }}>
          Зачем эта страница и что такое «ушко»
        </summary>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.55 }}>
          <li>Это не бой — Supabase не нужен. Сообщения в чате никуда не уходят.</li>
          <li>
            Ниже — тот же HTML/CSS-класс, что у онлайн-стола в режиме «Стандарт после short»: можно проверить скролл к чату и боковую кнопку.
          </li>
          <li>
            «Ушко» — закреплённая справа кнопка 💬; глиф и «Чат» прокручивают к панели внизу и сворачивают ушко в рельсу. Полный чат — кнопка «Чат» внизу
            или «Свернуть» в развёрнутой панели.
          </li>
        </ol>
      </details>

      {/* Макет стола — единственная прокрутка по вертикали внутри рамки */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '0 8px 10px',
        }}
      >
        <div
          className={[
            'game-table-root',
            'viewport-mobile',
            standardAfterShort ? 'viewport-mobile-standard-from-short-vh' : '',
            'game-mobile-table-chat',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: 12,
            border: '1px solid rgba(71, 85, 105, 0.55)',
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
          }}
        >
          <div
            className={[
              'game-table-main-wrap',
              standardAfterShort ? 'game-table-main-wrap--standard-from-short-vh' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              flex: 1,
              minHeight: 0,
              width: '100%',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden auto',
              WebkitOverflowScrolling: 'touch',
              padding:
                'var(--game-header-padding-top, 7px) var(--game-header-padding, 14px) 12px var(--game-header-padding, 14px)',
            }}
          >
            <header className="game-header" style={{ flexShrink: 0, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Шапка стола (заглушка)</div>
            </header>

            <div
              className="game-table-block game-table-block-mobile"
              style={{
                flex: '1 1 auto',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                width: '100%',
              }}
            >
              <div
                style={{
                  flex: '0 0 auto',
                  minHeight: 'min(95vh, 820px)',
                  padding: '12px 12px 16px',
                  borderRadius: 10,
                  border: '2px dashed rgba(100, 116, 139, 0.55)',
                  background: 'rgba(30, 41, 59, 0.35)',
                  marginBottom: 8,
                  fontSize: 13,
                  color: '#cbd5e1',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 10,
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Зона стола (листайте ↓)
                </div>
                <p style={{ margin: '28px 0 8px', maxWidth: '34em' }}>
                  Прокрутите <strong style={{ color: '#e2e8f0' }}>эту рамку внутри макета</strong> вниз — под серой «панелью игрока» будут кнопка
                  «Чат» и боковое ушко (если включён режим выше и чат свёрнут).
                </p>
              </div>

              <div
                className="game-mobile-bottom-row"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  width: '100%',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    height: 48,
                    borderRadius: 10,
                    background: 'rgba(51, 65, 85, 0.55)',
                    marginBottom: 6,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 12,
                    fontSize: 11,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                  aria-hidden
                >
                  Панель игрока (заглушка)
                </div>
                <TableChatDock
                  variant="mobile"
                  roomId={LAB_ROOM_ID}
                  userId={LAB_USER_ID}
                  displayName="Лаборатория"
                  mobileSideEarEnabled={standardAfterShort}
                  offlineUiLab
                  offlineUiLabEarMock={offlineUiLabEarMock}
                  offlineUiLabIncomingSeq={labIncomingSeq}
                  onMobileChatCollapsedChange={onMobileChatCollapsedChange}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
