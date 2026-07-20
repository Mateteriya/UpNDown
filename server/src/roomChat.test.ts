import { describe, expect, it } from 'vitest';
import { RoomChatStore } from './roomChat.js';
import { RoomStore } from './rooms.js';

describe('RoomChatStore', () => {
  it('posts and returns history for room members', () => {
    const rooms = new RoomStore();
    const chat = new RoomChatStore();
    const room = rooms.createRoom({
      hostUserId: 'u0',
      displayName: 'Хост',
      protocolVersion: 2,
    });
    rooms.joinRoom({ code: room.code, userId: 'u1', displayName: 'Гость' });
    const live = rooms.getById(room.id)!;

    const a = chat.post(live, 'u1', 'Гость', 'Привет');
    expect('message' in a).toBe(true);
    if (!('message' in a)) return;
    expect(a.message.body).toBe('Привет');

    const hist = chat.history(room.id);
    expect(hist).toHaveLength(1);
    expect(hist[0].user_id).toBe('u1');
  });

  it('rejects non-members and empty body', () => {
    const rooms = new RoomStore();
    const chat = new RoomChatStore();
    const room = rooms.createRoom({
      hostUserId: 'u0',
      displayName: 'Хост',
      protocolVersion: 2,
    });
    expect(chat.post(room, 'stranger', 'X', 'hi')).toEqual({ error: 'not_member' });
    expect(chat.post(room, 'u0', 'Хост', '   ')).toEqual({ error: 'bad_body' });
  });
});
