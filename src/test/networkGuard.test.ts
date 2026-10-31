import { describe, expect, it } from 'vitest';
import https from 'node:https';
import net from 'node:net';
import { takeBlockedNetworkAttempts } from './networkGuard';

describe('unit-test network isolation', () => {
  it('blocks fetch before transport without exposing destination or payload', async () => {
    await expect(fetch('https://network-test.invalid')).rejects.toThrow('Real network disabled');
    expect(takeBlockedNetworkAttempts()).toEqual(['fetch']);
  });
  it('blocks Node HTTPS and raw sockets before transport', () => {
    expect(() => https.get('https://network-test.invalid')).toThrow('Real network disabled');
    expect(() => new net.Socket().connect(443, 'network-test.invalid')).toThrow('Real network disabled');
    expect(takeBlockedNetworkAttempts()).toEqual(['https.get', 'socket.connect']);
  });
  it('blocks XHR and WebSocket before transport', () => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://network-test.invalid');
    expect(() => xhr.send()).toThrow('Real network disabled');
    expect(() => new WebSocket('wss://network-test.invalid')).toThrow('Real network disabled');
    expect(takeBlockedNetworkAttempts()).toEqual(['XMLHttpRequest.send', 'WebSocket']);
  });
});
