# LAN Server V2 — RFC

Server-authoritative протокол для Up&Down (LAN и VPS альфа).  
**Ветка:** `feat/lan-server-v2`. Workflow: [LAN-SERVER-V2-WORKFLOW.md](./LAN-SERVER-V2-WORKFLOW.md).

## Принципы

1. Клиент шлёт **команды** (`play_card`, `place_bid`), не полный JSON стола.
2. Сервер применяет `GameEngine` и рассылает `game_state@revision`.
3. `completeTrick` и `startNextDeal` — **только на сервере** (таймеры 2s / 4.5s).
4. Клиент: `if incoming.revision <= local → ignore`. Без optimistic UI, без sync poll на LAN.

## Комната

```ts
protocol_version?: 1 | 2
```

**Сервер (ветка v2):** новые комнаты — **`protocol_version: 2`** по умолчанию.  
Явный откат: `create_room` с `protocolVersion: 1`.

**Клиент:** при `VITE_ONLINE_TRANSPORT=ws` на `feat/lan-server-v2` все игровые команды идут через v2 (`OnlineGameContextV2`).  
LAN-сборка QR (`npm run build:host-game`) зашивает v2 в `vite.host.config.ts`.

## Клиент → сервер

### Лобби (без изменений)

`create_room`, `join_room`, `leave_room`, `recover_join`, `subscribe_room`, `get_room`, `update_slots`, `update_display_name`, `list_public_waiting`, `peek_room`

`create_room` для v2: поле `protocolVersion: 2`.

### Игра (v2)

| type | Поля | Кто |
|------|------|-----|
| `start_game` | `roomId`, `playerId` | хост (slot 0) |
| `place_bid` | `roomId`, `seat`, `bid` | текущий игрок |
| `play_card` | `roomId`, `seat`, `card` | текущий игрок |
| `take_pause` | `roomId`, `playerId` | игрок |
| `return_from_pause` | `roomId`, `playerId` | игрок |
| `host_return_slot` | `roomId`, `hostId`, `seat` | хост |
| `transfer_host` | `roomId`, `hostId`, `newHostUserId` | хост |
| `host_resolve_absent` | `roomId`, `choice` | хост |

**Запрещено в v2:** `update_state`.

## Сервер → клиент

| type | Поля |
|------|------|
| `game_state` | `roomId`, `revision`, `state`, `playerSlots?`, `roomPhase?` |
| `room_meta` | `room` |
| `command_result` | `requestId`, `ok`, `error?`, `revision?` |
| `room_snapshot` | лобби (как v1) |

## Ошибки

`not_your_turn`, `invalid_bid`, `invalid_card`, `wrong_phase`, `room_not_found`, `not_host`, `seat_mismatch`, `game_not_started`

## Поток взятки

```
play_card (4-я карта) → game_state (pendingTrickCompletion)
  → сервер ждёт 2000 ms → completeTrick → game_state
```

## Поток раздачи

```
deal-complete → сервер ждёт 4500 ms → startNextDeal → game_state
```

## ИИ

Серверный `AiDriver` (180 ms tick) для пустых слотов во всех v2-комнатах. Клиент не шлёт `sendState` / `sendCompleteTrick`.
