import { describe, expect, it } from 'vitest';
import { isTriagePending, triageBadge, triageView } from './triage';

describe('triageView', () => {
  it('is pending while triage_source is absent', () => {
    expect(triageView({})).toEqual({ state: 'pending' });
  });

  it('reports AI triage with its model', () => {
    expect(triageView({ triage_source: 'ai', triage_model: 'claude-haiku-5-5' })).toEqual({ state: 'ai', model: 'claude-haiku-5-5' });
    expect(triageView({ triage_source: 'ai', triage_model: null })).toEqual({ state: 'ai' });
  });

  it('keeps the reason only when rules were used after AI failed', () => {
    expect(triageView({ triage_source: 'rules', triage_error: 'timeout' })).toEqual({ state: 'rules', reason: 'timeout' });
    expect(triageView({ triage_source: 'rules' })).toEqual({ state: 'rules' });
  });
});

describe('triageBadge', () => {
  it('labels each state so that colour is never the only cue', () => {
    expect(triageBadge({ state: 'pending' })).toEqual({ label: 'Triage in progress', tone: 'neutral' });
    expect(triageBadge({ state: 'ai', model: 'claude-haiku-5-5' })).toEqual({ label: 'AI · claude-haiku-5-5', tone: 'brand' });
    expect(triageBadge({ state: 'ai' })).toEqual({ label: 'AI triage', tone: 'brand' });
    expect(triageBadge({ state: 'rules', reason: 'invalid_json' })).toEqual({ label: 'Rules', tone: 'warning', reason: 'invalid_json' });
    expect(triageBadge({ state: 'rules' })).toEqual({ label: 'Rules', tone: 'warning' });
  });
});

describe('isTriagePending', () => {
  it('polls only until triage_source appears', () => {
    expect(isTriagePending({ triage_source: undefined })).toBe(true);
    expect(isTriagePending({ triage_source: 'rules' })).toBe(false);
    expect(isTriagePending({ triage_source: 'ai' })).toBe(false);
  });
});
