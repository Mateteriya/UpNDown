# Карманный хост: выбран WebRTC host-peer

**Решение фазы 3:** не тащить Node на телефон; целевой путь для Android/iOS-хоста — **WebRTC DataChannel (star: один host-peer)**.

## Почему не embedded Node

- Android: возможен встроенный HTTP+WS в Capacitor, но дублирует весь `server/` и жрёт батарею/фон.
- iOS: фоновый сокет-сервер практически недоступен в App Store модели.
- WebRTC уже рассчитан на NAT/мобильные ОС; для LAN mesh/star достаточно.

## Модель

```
HostPeer (телефон хоста)
  ├─ DataChannel → Guest1
  ├─ DataChannel → Guest2
  └─ DataChannel → Guest3
```

- Комнатная логика (раздачи, ходы) живёт у **host-peer** (тот же движок, что сейчас на Node, портируется в shared package позже).
- Сигналинг в чистом offline LAN: QR с одноразовым SDP offer **или** mDNS / ручной код + локальный WS только для handshake (если есть мини-хост на ПК).
- Пока Node LAN-сервер остаётся **production path** для ПК/клуба.

## Скаффолд в коде

- `src/lib/partyHost/webrtcHostTypes.ts` — контракт сообщений.
- `src/lib/partyHost/webrtcHostSession.ts` — заглушка сессии (createOffer / acceptAnswer stubs).

Включать UI хоста на телефоне только после рабочего сигналинга.

## Пока пользователям

ПК-хост + hotspot телефона = тот же «подвал», без WebRTC.
