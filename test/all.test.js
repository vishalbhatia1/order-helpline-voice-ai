// Run with:  npm test   (Node 18+, no installs needed)
const test = require('node:test');
const assert = require('node:assert');
const brain = require('../src/brain');
const nlu = require('../src/nlu');
const allocator = require('../src/allocator');
const scenarios = require('../src/scenarios');
const lambda = require('../lambda/index');

const SETTINGS = { botPercent: 30, holdoutPercent: 10 };

async function play(sc, extra) {
  const phone = allocator.findPhone(sc.route, SETTINGS);
  let t = 0;
  const call = brain.createCall({ phone, settings: Object.assign({}, SETTINGS, extra || {}), now: 0 });
  const trace = [brain.startCall(call, {})];
  for (const st of sc.steps) {
    if (call.ended) break;
    t += 8000;
    trace.push(await brain.handleInput(call, st, { noWait: true, now: () => t }));
  }
  return { call, trace };
}

for (const sc of scenarios) {
  test(`scenario: ${sc.title}`, async () => {
    const { call } = await play(sc);
    assert.ok(call.ended, 'call should end');
    assert.strictEqual(call.outcome.type, sc.expect.type, JSON.stringify(call.outcome));
    if (sc.expect.reason) assert.strictEqual(call.outcome.reason, sc.expect.reason);
    if (sc.expect.planned !== undefined) assert.strictEqual(call.outcome.planned, sc.expect.planned);
  });
}

test('slow lookup plays a filler; turning filler off creates dead air', async () => {
  const sc = scenarios.find((s) => s.id === 'slow');
  const withFiller = await play(sc);
  assert.ok(withFiller.trace.flatMap((r) => r.says).includes(brain.SAY.filler));
  const noFiller = await play(sc, { filler: false });
  assert.ok(!noFiller.trace.flatMap((r) => r.says).includes(brain.SAY.filler));
});

test('escalation summary tells the agent what happened', async () => {
  const { call } = await play(scenarios.find((s) => s.id === 'missing'));
  assert.match(call.outcome.summary, /Verified caller \(order 10023/);
  assert.match(call.outcome.summary, /never arrived/);
  assert.strictEqual(call.outcome.queue, 'Delivery Claims');
});

test('understanding: spoken digits, intents, mood', () => {
  assert.strictEqual(nlu.normaliseDigits('one oh oh two one'), '10021');
  assert.strictEqual(nlu.understand('it says delivered but I never got it').intent, 'not_received');
  assert.strictEqual(nlu.understand('track my order').intent, 'check_order');
  assert.ok(nlu.understand('can I talk to a real person').agentRequested);
  assert.ok(nlu.understand('This is RIDICULOUS, worst service').sentiment <= -0.6);
  assert.strictEqual(nlu.understand('94107', 'zip').entities.zip, '94107');
});

test('traffic split: about 30% of non-holdout callers reach the bot, and it is sticky', () => {
  let bot = 0, hold = 0; const N = 20000;
  for (let i = 0; i < N; i++) {
    const r = allocator.allocate('+1212555' + String(i).padStart(4, '0'), SETTINGS);
    if (r.route === 'BOT') bot++; else if (r.reason.includes('holdout')) hold++;
  }
  assert.ok(Math.abs(hold / N - 0.10) < 0.015, `holdout ${hold / N}`);
  assert.ok(Math.abs(bot / N - 0.27) < 0.02, `bot ${bot / N}`); // 30% of the 90% outside holdout
  assert.deepStrictEqual(allocator.allocate('+12125550001', SETTINGS), allocator.allocate('+12125550001', SETTINGS));
  assert.strictEqual(allocator.allocate('+12125550001', { killSwitch: true }).route, 'HUMAN');
});

// ---------- the AWS Lambda behind Amazon Lex (same brain) ----------
function lexEvent(text, attrs) {
  return { inputTranscript: text, inputMode: 'Speech', invocationSource: 'DialogCodeHook',
    sessionState: { sessionAttributes: attrs || { callerPhone: '+14155550123' }, intent: { name: 'OrderHelp', state: 'InProgress', slots: {} } } };
}
async function lexConversation(lines) {
  let attrs, res;
  for (const l of lines) { res = await lambda.handler(lexEvent(l, attrs)); attrs = res.sessionState.sessionAttributes; }
  return res;
}

test('lambda: happy path ends with intent OrderResolved', async () => {
  const r = await lexConversation(['where is my order', '10021', '94107', 'no thanks']);
  assert.strictEqual(r.sessionState.dialogAction.type, 'Close');
  assert.strictEqual(r.sessionState.intent.name, 'OrderResolved');
  assert.strictEqual(r.sessionState.sessionAttributes.va_outcome, 'contained');
});

test('lambda: mid-conversation keeps listening (ElicitIntent) and speaks the reply', async () => {
  const r = await lexConversation(['where is my order']);
  assert.strictEqual(r.sessionState.dialogAction.type, 'ElicitIntent');
  assert.match(r.messages[0].content, /order number/);
});

test('lambda: missing parcel ends with EscalateToAgent + queue + summary attributes', async () => {
  const r = await lexConversation(['it says delivered but I never got it', '10023', '60601']);
  const a = r.sessionState.sessionAttributes;
  assert.strictEqual(r.sessionState.intent.name, 'EscalateToAgent');
  assert.strictEqual(a.va_queue, 'Delivery Claims');
  assert.strictEqual(a.va_reason, 'missing_package');
  assert.match(a.va_summary, /never arrived/);
  assert.ok(JSON.stringify(a).length < 8000, 'session attributes stay small');
});
