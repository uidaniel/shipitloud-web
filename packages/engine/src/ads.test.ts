import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anomaly, capState, modeFor, optimize, policyCheck, simulateDay, splitBudget, type AdStats } from './ads.ts';

test('mode: autopilot from $10 a day, test below', () => {
  assert.equal(modeFor(999), 'test');
  assert.equal(modeFor(1000), 'autopilot');
});

test('budgets split in whole cents and never exceed the total', () => {
  assert.deepEqual(splitBudget(1000, [1, 1, 1]), [334, 333, 333]);
  assert.equal(splitBudget(1001, [3, 1]).reduce((a, b) => a + b, 0), 1001);
  assert.deepEqual(splitBudget(500, [0, 0]), [250, 250]);
  assert.deepEqual(splitBudget(500, []), []);
});

test('policy pre-check flags risky copy and special categories', () => {
  assert.deepEqual(policyCheck('Invoice clients from WhatsApp and get paid to your bank.').flags, []);
  assert.ok(policyCheck('Are you in debt? Get paid faster.').flags[0]!.includes('personal'));
  assert.ok(policyCheck('Guaranteed income in 30 days').flags.includes('Guaranteed results or income'));
  assert.ok(policyCheck('Make $500 a day from home').flags.includes('Unrealistic money claim'));
  assert.ok(policyCheck('Only 3 spots left!!').flags.length >= 2);
  assert.ok(policyCheck('The #1 invoicing app').flags.includes('Ranking or rating claim needs proof'));
  assert.equal(policyCheck('Get paid faster', 'Instant loans for small businesses').special, 'credit');
  assert.equal(policyCheck('Find renters for your apartments').special, 'housing');
  assert.equal(policyCheck('We are hiring designers').special, 'employment');
  assert.equal(policyCheck('Invoices on WhatsApp').special, null);
});

test('caps and anomalies', () => {
  const caps = { dailyCapCents: 1000, totalCapCents: 5000 };
  assert.equal(capState(500, 2000, caps), 'ok');
  assert.equal(capState(1000, 2000, caps), 'daily');
  assert.equal(capState(200, 5000, caps), 'total');
  assert.equal(anomaly(1050, caps), null, '5% over is within platform rounding');
  assert.match(anomaly(1200, caps)!, /\$12 today against a \$10 daily cap/);
  assert.match(anomaly(800, caps, 200)!, /jumped/);
});

const ad = (id: string, o: Partial<AdStats> = {}): AdStats => ({ id, status: 'active', budget_cents: 333, spend_cents: 2300, impressions: 3000, clicks: 40, conversions: 4, ctr_first3: 0.013, ctr_last3: 0.013, impressions_last3: 1200, ...o });

test('optimizer waits for the test, then pauses losers, shifts budget and refreshes tired ads', () => {
  const ads = [ad('win', { conversions: 10 }), ad('mid', { conversions: 5 }), ad('lose', { conversions: 1 })];
  assert.equal(optimize({ mode: 'test', goal: 'signups', daily_cap_cents: 1000, age_days: 20 }, ads).actions.length, 0);
  assert.match(optimize({ mode: 'autopilot', goal: 'signups', daily_cap_cents: 1000, age_days: 3 }, ads).note, /Day 4 of the 7-day test/);
  const r = optimize({ mode: 'autopilot', goal: 'signups', daily_cap_cents: 1000, age_days: 8 }, ads);
  const pause = r.actions.filter((a) => a.type === 'pause');
  assert.deepEqual(pause.map((a) => a.adId), ['lose']);
  assert.match(pause[0]!.reason, /\$23 per signup vs \$2\.30 for the best ad/);
  const budgets = r.actions.filter((a): a is Extract<typeof a, { type: 'budget' }> => a.type === 'budget');
  const win = budgets.find((b) => b.adId === 'win')!;
  assert.ok(win.cents > 333);
  assert.ok(budgets.reduce((n, b) => n + b.cents, 0) <= 1000);
  const tired = optimize({ mode: 'autopilot', goal: 'signups', daily_cap_cents: 1000, age_days: 8 }, [ad('a', { conversions: 5, ctr_last3: 0.006 }), ad('b', { conversions: 5 })]);
  assert.ok(tired.actions.some((x) => x.type === 'refresh' && x.adId === 'a'));
  const lastOne = optimize({ mode: 'autopilot', goal: 'signups', daily_cap_cents: 1000, age_days: 8 }, [ad('only', { conversions: 0 })]);
  assert.ok(!lastOne.actions.some((x) => x.type === 'pause'), 'never pause the last running ad');
});

test('simulator is deterministic and never spends past the budget', () => {
  const a = simulateDay('ad1', '2026-10-01', 1000);
  assert.deepEqual(a, simulateDay('ad1', '2026-10-01', 1000));
  assert.ok(a.spend_cents <= 1000 && a.spend_cents >= 860);
  assert.ok(simulateDay('ad1', '2026-10-01', 1000, 0.5).spend_cents <= 500);
  assert.ok(simulateDay('ad1', '2026-10-01', 1000, 1, 1.3).spend_cents > 1000, 'overspend knob for testing anomalies');
  assert.notDeepEqual(simulateDay('ad1', '2026-10-01', 1000), simulateDay('ad2', '2026-10-01', 1000));
});
