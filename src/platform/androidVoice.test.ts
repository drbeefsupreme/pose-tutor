import { CapacitorException, ExceptionCode } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeVoiceInput } from './androidVoice';
import type { ListenState } from './types';
import type { TutorVoicePlugin, ListenResult } from './voicePlugin';

/** A voice plugin whose sessions end when the test says so. */
function fakePlugin() {
  const sessions: { resolve: (r: ListenResult) => void; reject: (err: unknown) => void }[] = [];
  let cancels = 0;
  const plugin: TutorVoicePlugin = {
    listen: () => {
      const { promise, resolve, reject } = Promise.withResolvers<ListenResult>();
      sessions.push({ resolve, reject });
      return promise;
    },
    cancel: async () => void cancels++,
  };
  return { plugin, sessions, cancels: () => cancels };
}

/** A rejection as Capacitor delivers `call.reject(message, code)`. */
const failure = (code: string) => new CapacitorException(`Speech recognition failed: ${code}`, code as ExceptionCode);

function voice() {
  const fake = fakePlugin();
  const heard: string[] = [];
  const states: ListenState[] = [];
  const input = new NativeVoiceInput(fake.plugin, (text) => heard.push(text), (state) => states.push(state));
  return { ...fake, heard, states, input };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('NativeVoiceInput', () => {
  it('listens continuously: each phrase starts the next session, silence too', async () => {
    const { input, sessions, heard, states } = voice();
    input.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sessions).toHaveLength(1);
    sessions[0].resolve({ text: 'next pose', mode: 'onDevice' });
    await vi.advanceTimersByTimeAsync(0);
    sessions[1].reject(failure('no-speech'));
    await vi.advanceTimersByTimeAsync(0);
    sessions[2].resolve({ text: "what's wrong", mode: 'onDevice' });
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).toEqual(['next pose', "what's wrong"]);
    expect(sessions).toHaveLength(4);
    expect(states).toEqual(['listening']);
  });

  it('cancels the session while the tutor speaks and listens again shortly after', async () => {
    const { input, sessions, cancels, states } = voice();
    input.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    input.setSuppressed(true);
    expect(cancels()).toBe(1);
    sessions[0].reject(failure('aborted'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sessions).toHaveLength(1);
    input.setSuppressed(false);
    await vi.advanceTimersByTimeAsync(399);
    expect(sessions).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sessions).toHaveLength(2);
    expect(states).toEqual(['listening', 'paused', 'listening']);
  });

  it('maps a missing microphone permission to denied and stops trying', async () => {
    const { input, sessions, states } = voice();
    input.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    sessions[0].reject(failure('not-allowed'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(states).toEqual(['listening', 'denied']);
    expect(input.error).toBe('not-allowed');
    expect(sessions).toHaveLength(1);
  });

  it('shows other failures as error with the code and retries after a pause', async () => {
    const { input, sessions, states } = voice();
    input.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    sessions[0].reject(failure('network'));
    await vi.advanceTimersByTimeAsync(2999);
    expect(states).toEqual(['listening', 'error']);
    expect(input.error).toBe('network');
    await vi.advanceTimersByTimeAsync(1);
    expect(sessions).toHaveLength(2);
    sessions[1].resolve({ text: null, mode: 'online' });
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(['listening', 'error', 'listening']);
    expect(input.error).toBeUndefined();
  });

  it('hands an injected phrase to the commands only while voice commands are on', async () => {
    const { input, heard } = voice();
    expect(input.inject('pause')).toBe(false);
    input.setEnabled(true);
    expect(input.inject('pause')).toBe(true);
    input.dispose();
    expect(input.inject('resume')).toBe(false);
    expect(heard).toEqual(['pause']);
    expect(input.state).toBe('off');
  });
});
