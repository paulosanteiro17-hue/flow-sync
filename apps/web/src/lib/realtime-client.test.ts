import { CLIENT_EVENTS, type AnyRealtimeEnvelope, type SubscribeAck } from '@flowsync/shared';
import { describe, expect, it, vi } from 'vitest';
import { RealtimeClient } from './realtime-client';

interface FakeSocket {
  connected: boolean;
  emit: (
    event: string,
    payload: unknown,
    acknowledgement?: (response: SubscribeAck) => void,
  ) => void;
}

interface RealtimeClientInternals {
  socket: FakeSocket | null;
  handleEnvelope: (envelope: AnyRealtimeEnvelope) => void;
}

function event(seq: number, id = `event-${seq}`): AnyRealtimeEnvelope {
  return {
    id,
    type: 'presence.updated',
    room: 'board:board-1',
    seq,
    ts: new Date(0).toISOString(),
    actorId: null,
    payload: { room: 'board:board-1', users: [] },
  };
}

describe('RealtimeClient subscription sequencing', () => {
  it('requests a resync when the subscription acknowledgement is ahead', async () => {
    const client = new RealtimeClient();
    const resync = vi.fn();
    client.onResync(resync);

    const internals = client as unknown as RealtimeClientInternals;
    internals.socket = {
      connected: true,
      emit: (name, _payload, acknowledgement) => {
        if (name === CLIENT_EVENTS.subscribe) {
          acknowledgement?.({ room: 'board:board-1', seq: 7 });
        }
      },
    };

    await client.subscribe('board', 'board-1');

    expect(resync).toHaveBeenCalledOnce();
    expect(resync).toHaveBeenCalledWith('board:board-1');
  });

  it('does not rewind when an event beats the acknowledgement or a snapshot', async () => {
    const client = new RealtimeClient();
    const received = vi.fn();
    const resync = vi.fn();
    client.onEvent(received);
    client.onResync(resync);

    const internals = client as unknown as RealtimeClientInternals;
    internals.socket = {
      connected: true,
      emit: (name, _payload, acknowledgement) => {
        if (name !== CLIENT_EVENTS.subscribe) return;
        internals.handleEnvelope(event(8));
        acknowledgement?.({ room: 'board:board-1', seq: 7 });
      },
    };

    await client.subscribe('board', 'board-1');
    client.adoptSequence('board', 'board-1', 6);
    received.mockClear();
    resync.mockClear();

    internals.handleEnvelope(event(9));

    expect(received).toHaveBeenCalledOnce();
    expect(resync).not.toHaveBeenCalled();
  });
});
