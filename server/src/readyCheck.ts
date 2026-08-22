import { accessSync, constants, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { isJwtConfigured, readWsAuthMode } from './wsAuth.js';
import { isRoomPersistEnabled, resolveRoomPersistPath } from './roomPersist.js';
import { supabaseFinishConfigured } from './matchFinish.js';

export type ReadyStatus = {
  ready: boolean;
  persistWritable: boolean;
  jwtConfigured: boolean;
  auth: ReturnType<typeof readWsAuthMode>;
  supabaseConfigured: boolean;
};

export function persistDirWritable(): boolean {
  if (!isRoomPersistEnabled()) return true;
  try {
    const path = resolveRoomPersistPath();
    mkdirSync(dirname(path), { recursive: true });
    accessSync(dirname(path), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function localReadyStatus(): ReadyStatus {
  const auth = readWsAuthMode();
  const jwtConfigured = isJwtConfigured();
  const persistWritable = persistDirWritable();
  const supabaseConfigured = supabaseFinishConfigured();
  let ready = persistWritable;
  if (auth === 'required') ready = ready && jwtConfigured;
  return { ready, persistWritable, jwtConfigured, auth, supabaseConfigured };
}
