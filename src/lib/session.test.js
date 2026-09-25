import { describe, it, expect } from 'vitest';
import { describeSessionState, isSessionExpired } from './session.js';

// The pure helpers must not need a DOM: readSessionState is exercised through
// describeSessionState with hand-built state objects so the UI copy is pinned
// without a sessionStorage shim.

const HOUR = 60 * 60 * 1000;

describe('isSessionExpired', () => {
  it('treats a missing token as expired', () => {
    expect(isSessionExpired('', Date.now() + HOUR)).toBe(true);
    expect(isSessionExpired(null, Date.now() + HOUR)).toBe(true);
  });

  it('treats a missing or unparseable expiry as expired', () => {
    expect(isSessionExpired('tkn', undefined)).toBe(true);
    expect(isSessionExpired('tkn', 'not-a-number')).toBe(true);
  });

  it('accepts a token well before expiry', () => {
    expect(isSessionExpired('tkn', Date.now() + HOUR)).toBe(false);
  });

  it('expires one minute early so a request never flies with a dying token', () => {
    const now = Date.now();
    expect(isSessionExpired('tkn', now + 30_000, now)).toBe(true);
    expect(isSessionExpired('tkn', now + 120_000, now)).toBe(false);
  });
});

describe('describeSessionState', () => {
  it('explains why session mode is off', () => {
    expect(describeSessionState({ status: 'disabled' })).toMatch(/tidak dipakai/i);
  });

  it('points a missing session at Settings', () => {
    expect(describeSessionState({ status: 'missing' })).toMatch(/Settings/);
  });

  it('points an expired session at Settings', () => {
    expect(describeSessionState({ status: 'expired' })).toMatch(/kedaluwarsa/i);
  });

  it('reports remaining hours and minutes for an active session', () => {
    const label = describeSessionState({ status: 'active', remainingMs: 5 * HOUR + 30 * 60_000, expiresAt: Date.now() + 5 * HOUR });
    expect(label).toMatch(/Sesi aktif/);
    expect(label).toMatch(/5j 30m/);
  });

  it('reports remaining minutes under an hour', () => {
    const label = describeSessionState({ status: 'active', remainingMs: 12 * 60_000, expiresAt: Date.now() + 12 * 60_000 });
    expect(label).toMatch(/12m/);
  });

  it('does not claim an active session once the expiry has passed', () => {
    const now = Date.now();
    const label = describeSessionState({ status: 'active', remainingMs: 0, expiresAt: now - 1000 }, now);
    expect(label).toMatch(/kedaluwarsa/i);
  });

  it('falls back to a safe message for an unknown status', () => {
    expect(describeSessionState({})).toMatch(/tidak diketahui/i);
    expect(describeSessionState(null)).toMatch(/tidak diketahui/i);
  });
});
