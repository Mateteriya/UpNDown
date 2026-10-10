# Офлайн-вечеринка (подвал / космос)

Сценарий: **один хост + одна Wi‑Fi + QR во «Вход в комнату»**, без интернета.

## Быстрый чеклист (подвал)

**Роли:** панель хоста = только ПК (пока). Телефон = гость (QR). Хост «в кармане» — эпик 2.

На панели сверху — **две кнопки-ситуации**, не инструкция:

1. **«У нас уже есть Wi‑Fi»** → большая кнопка «Запустить игру» → «Создать стол с QR».
2. **«Сделаем свой Wi‑Fi с телефона»** (подвал) → короткая шпаргалка Android/iPhone → то же «Запустить» / «Создать стол».

Друзьям на телефонах: камера на QR. Кнопку «Свой хост» на телефоне жать не обязательно.

APK для раздачи: на панели **«Получить APK»** или `npm run party:apk` / `npm run party:apk:build`.

Очередь эпиков: [VISION-QUEUE.md](./VISION-QUEUE.md).

## Лимиты клуба

LAN-дефолты: до **22** комнат (`WS_MAX_ROOMS` / `WS_MAX_ROOMS_PER_IP`).

На панели хоста: переключатель **Клуб** — автостарт сервера после сборки, крупные QR и витрина снизу.  
Env: `HOST_CLUB_AUTO_START=1`, `HOST_CLUB_MAX_ROOMS=22`.

## Deep link (установленный клиент)

- `updown://join?code=XXXX&autojoin=1` — вход в комнату вечеринки
- `updown://auth-callback` — возврат после Google / письма подтверждения (Capacitor APK)
- Android intent-filter: уже в `AndroidManifest.xml`, эталон [android-deep-link-snippet.xml](./android-deep-link-snippet.xml) (`appId: games.updown.app`)
- **Supabase URL:** вечеринка ≠ сайт. Redirect URLs = `http://IP:3001/play/auth-callback.html`; на вечер Site URL можно = `http://IP:3001/play/` (без ?code=). Иначе Google уносит на [up2down.online](https://up2down.online) (часто VPN). Готовые строки — на панели хоста → «Клуб · APK · журнал». Подробно: [ЛОКАЛЬНАЯ-РАЗРАБОТКА.md](./ЛОКАЛЬНАЯ-РАЗРАБОТКА.md)
- APK: в Redirect URLs также `updown://auth-callback`
- PWA: query в `start_url` / ссылке с хоста; браузер — `/play/auth-callback.html`

## Кнопка на главной

«Свой хост / вечеринка» (спец. UI):
- **ПК** — справа по центру (капсула, можно двигать) → панель `http://127.0.0.1:3927/`.
- **Мобилка** — над «Правила»; сервер **не** стартует, показывается подсказка (гость + QR).

Флаг: `VITE_PARTY_HOST_UI=1|0`. Статус эпиков: [OFFLINE-PARTY-STATUS.md](./OFFLINE-PARTY-STATUS.md).

## Что не обещаем

- Тихая установка APK/IPA одним QR без участия системы (согласие ОС обязательно).
- Партия целиком по Bluetooth (только передать код/APK через шаринг ОС).
- Полноценный Node-сервер на iPhone (хост на iPhone — позже через WebRTC).

Синхронизация партии с аккаунтом (email-claim, matchKey, ЛК): [OFFLINE-PARTY-SYNC.md](./OFFLINE-PARTY-SYNC.md).

Шаги дальше (APK-автосборка, WebRTC-карман, iPhone-host):  
[OFFLINE-PARTY-STATUS.md](./OFFLINE-PARTY-STATUS.md).

Подробнее про карманный хост: [POCKET-HOST-WEBRTC.md](./POCKET-HOST-WEBRTC.md).
