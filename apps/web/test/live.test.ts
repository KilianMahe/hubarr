// SPDX-License-Identifier: AGPL-3.0-or-later
// Client du flux temps réel (P5.2) : une connexion multiplexée, sujets
// acceptés, données distribuées, repli immédiat vers le polling quand le flux
// tombe, reconnexion en arrière-plan ; intervalle de polling d'une requête
// selon l'état du flux.

import { QueryClient, VueQueryPlugin, useQueryClient } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { LiveClient, RECONNECT_MIN_MS, useLiveQuery } from '../src/app/live';

class FakeSource {
  static instances: FakeSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  constructor(readonly url: string) {
    FakeSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {
    this.closed = true;
  }
  ready(accepted: string[]): void {
    this.listeners.get('ready')?.({
      data: JSON.stringify({ accepted, rejected: [] }),
    } as MessageEvent<string>);
  }
  push(topic: string, data: unknown): void {
    this.onmessage?.({ data: JSON.stringify({ topic, data }) } as MessageEvent<string>);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSource.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

const factory = (url: string) => new FakeSource(url) as unknown as EventSource;

describe('client temps réel', () => {
  it('une connexion pour tous les sujets, données distribuées, repli puis reconnexion', async () => {
    const client = new LiveClient(factory);
    const received: unknown[] = [];
    const lost = vi.fn();
    client.onLost(lost);
    const stopA = client.subscribe('downloads.qbittorrent', (data) => received.push(data));
    client.subscribe('health', () => undefined);
    await vi.advanceTimersByTimeAsync(200);
    expect(FakeSource.instances).toHaveLength(1);
    const source = FakeSource.instances[0];
    expect(source?.url).toBe('/api/events?topics=downloads.qbittorrent%2Chealth');
    source?.ready(['downloads.qbittorrent']);
    expect(client.isLive('downloads.qbittorrent')).toBe(true);
    expect(client.isLive('health')).toBe(false);
    source?.push('downloads.qbittorrent', { active: 2 });
    expect(received).toEqual([{ active: 2 }]);

    // Coupure : repli aussitôt, reconnexion après le délai.
    source?.onerror?.();
    expect(client.isLive('downloads.qbittorrent')).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(source?.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(RECONNECT_MIN_MS);
    expect(FakeSource.instances).toHaveLength(2);

    // Un sujet en moins : la connexion est rouverte sur la nouvelle liste.
    stopA();
    await vi.advanceTimersByTimeAsync(200);
    expect(FakeSource.instances.at(-1)?.url).toBe('/api/events?topics=health');
    client.close();
  });

  it('sans EventSource : tout reste en polling', async () => {
    const client = new LiveClient(null);
    client.subscribe('health', () => undefined);
    await vi.advanceTimersByTimeAsync(200);
    expect(client.isLive('health')).toBe(false);
  });

  it('requête : polling coupé tant que le flux sert le sujet, valeur posée, relecture au repli', async () => {
    const client = new LiveClient(factory);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    let interval: () => number | false = () => -1;
    const Probe = defineComponent({
      setup() {
        const ref = useLiveQuery(
          { topic: 'health', queryKey: ['health'], mode: 'set', fallbackMs: 60_000 },
          client,
        );
        interval = () => ref.value;
        useQueryClient();
        return () => h('div');
      },
    });
    const wrapper = mount(Probe, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
    expect(interval()).toBe(60_000);
    await vi.advanceTimersByTimeAsync(200);
    FakeSource.instances[0]?.ready(['health']);
    expect(interval()).toBe(false);
    FakeSource.instances[0]?.push('health', { ok: 3 });
    expect(queryClient.getQueryData(['health'])).toEqual({ ok: 3 });
    FakeSource.instances[0]?.onerror?.();
    expect(interval()).toBe(60_000);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['health'] });
    wrapper.unmount();
    client.close();
  });
});
