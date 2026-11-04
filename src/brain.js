/**
 * brain.js — the ShopNow "Where is my order?" voice agent.
 *
 *   startCall()   : a call arrives -> traffic split -> bot greets (or straight to a person)
 *   handleInput() : one caller turn -> understand -> (maybe) call the order system -> rules -> reply
 *
 * Every step emits an EVENT  { layer, title, tech }  so you can SEE what is happening:
 *   layer = phone | genesys | split | connector | understand | rules | tool | bot | handoff | agent
 *   title = plain English, tech = the real technical thing behind it (SIP, WebSocket, API call...)
 *
 * Runs unchanged in the browser simulator and in AWS Lambda (behind Amazon Lex).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({ nlu: require('./nlu'), policy: require('./policy'), orders: require('./orders'), allocator: require('./allocator') });
  } else { root.OrderHelp = root.OrderHelp || {}; root.OrderHelp.brain = factory(root.OrderHelp); }
})(typeof self !== 'undefined' ? self : this, function (deps) {
  'use strict';
  const { nlu, policy, orders, allocator } = deps;

  const QUEUE_FOR = { missing_package: 'Delivery Claims', damaged_item: 'Returns & Exchanges', out_of_scope: 'Order Support', sensitive_topic: 'Fraud Team' };
  const GOALS = new Set(['check_order', 'not_received']);
  const SAY = {
    greeting: "Hi, thanks for calling ShopNow. I'm an AI assistant, and this call is recorded. I can track an order or help if a delivery went wrong. What can I do for you?",
    askOrder: "Sure, I can help with that. What's your 5-digit order number? You can say it or type it on your keypad.",
    askOrderAgain: "What's the order number? It's 5 digits and starts with a 1.",
    askZip: "Thanks. For security, what's the ZIP code on that order?",
    filler: 'One moment while I pull that up.',
    mismatch: "Hmm, I couldn't match that order number and ZIP code. Let's try once more. What's the order number?",
    anythingElse: 'Is there anything else I can help with?',
    goodbye: 'Thanks for calling ShopNow. Have a great day!',
    offerAgent: 'I can sort this out for you right now, it usually takes under a minute. Or I can connect you to a team member. Which would you prefer?',
    notUnderstood: "Sorry, I didn't catch that. I can track an order or help if a delivery went wrong. What would you like to do?",
    notUnderstoodSlot: "Sorry, I didn't catch that. What's your 5-digit order number?",
    silence: "Are you still there? You can say your order number, or say 'agent' to speak with a person.",
    lowConfidence: "Just to be sure I've got it right, could you say that another way?",
    forcedTransfer: "Let me get you to someone who can help. I'm passing along what we've covered, so you won't have to repeat it.",
    humanDirect: 'Thanks for calling ShopNow. Connecting you to a team member now.',
  };

  function id(n) { let s = ''; const a = 'abcdefghjkmnpqrstuvwxyz23456789'; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function pct(x) { return Math.round(x * 100) + '%'; }

  function createCall(opts) {
    const o = opts || {};
    return {
      id: o.id || 'call-' + id(6), phone: o.phone || '+14155550123', startedAt: o.now || Date.now(),
      settings: Object.assign({ botPercent: 30, holdoutPercent: 10, killSwitch: false, filler: true, fillerAfterMs: 1000, experiment: 'wismo-pilot' }, o.settings || {}),
      rules: Object.assign({}, policy.DEFAULT_RULES, o.rules || {}),
      state: 'new', goal: null, slots: { orderNumber: null, zip: null }, order: null, verified: false,
      scorecard: policy.newScorecard(), transcript: [], ended: false, outcome: null, route: null,
    };
  }

  /** The phone rings. Returns { events, says, ended }. */
  function startCall(call, ctx) {
    const out = collector(ctx);
    out.event('phone', 'Caller dials 1-800-SHOPNOW', 'SIP INVITE over TLS 5061 · audio as SRTP (G.711)');
    out.event('genesys', 'Genesys Cloud answers and runs the call flow', "Architect inbound flow 'ShopNow Main'");
    const a = (ctx && ctx.skipSplit) ? { route: 'BOT', bucket: '-', reason: 'split already done by the flow' } : allocator.allocate(call.phone, call.settings);
    call.route = a.route;
    out.event('split', a.route === 'BOT' ? 'Traffic split: this caller goes to the AI assistant' : 'Traffic split: this caller goes straight to a person', `${a.reason} (caller ${call.phone})`);
    if (a.route === 'HUMAN') {
      out.say(SAY.humanDirect);
      out.event('genesys', "Flow transfers the call to queue 'Order Support'", 'Transfer to ACD · normal priority');
      out.event('agent', 'A team member answers (no bot involved)', 'This caller is in the comparison group');
      return finish(call, out, { type: 'human_direct', planned: false, reason: a.reason, queue: 'Order Support' });
    }
    out.event('connector', 'Flow opens a live audio pipe to the AI assistant', 'Audio Connector: WebSocket wss://… open → opened (PCMU 8 kHz)');
    call.state = 'need_intent';
    out.say(SAY.greeting);
    return out.result(call);
  }

  /** One caller turn. input = { text } | { dtmf } | { silence: true } | { hangup: true } */
  async function handleInput(call, input, ctx) {
    const out = collector(ctx);
    if (call.ended) return out.result(call);
    const now = (ctx && ctx.now) ? ctx.now() : Date.now();
    const elapsedSeconds = (now - call.startedAt) / 1000;

    if (input.hangup) {
      out.event('phone', 'Caller hangs up while talking to the bot', 'SIP BYE → Audio Connector close / closed');
      return finish(call, out, { type: 'abandoned', planned: false, reason: 'caller_hung_up' });
    }

    let u, type = 'utterance';
    if (input.silence) {
      type = 'silence';
      out.event('phone', 'Caller says nothing (silence timeout)', 'No speech detected for 5 s');
      u = { intent: 'silence', confidence: null, entities: {}, sentiment: null, agentRequested: false };
    } else {
      const text = input.dtmf !== undefined ? String(input.dtmf) : String(input.text || '');
      if (input.dtmf === '0') type = 'dtmf';
      call.transcript.push({ who: 'caller', text });
      out.event('phone', input.dtmf !== undefined ? `Caller presses keys: ${text}` : `Caller says: "${text}"`,
        input.dtmf !== undefined ? 'DTMF tones (RFC 4733) → digits' : 'Audio frames → speech-to-text → text');
      u = nlu.understand(text, expecting(call));
      // An answer to the question we just asked is "in context", not a new topic.
      const filled = (expecting(call) === 'order_number' && u.entities.orderNumber) || (expecting(call) === 'zip' && u.entities.zip);
      if (filled && u.confidence < 0.9 && !u.agentRequested) u.intent = 'Dialog';
      if (input.dtmf === '0') { u.agentRequested = true; u.intent = 'agent'; }
      out.event('understand', describe(u), `intent=${u.intent} confidence=${u.confidence} sentiment=${u.sentiment}`);
    }

    const blocked = type === 'silence' || u.agentRequested || u.intent === 'unknown' || u.intent === 'agent' || (call.rules.alwaysHumanIntents || []).includes(u.intent);
    const step = blocked ? null : await advance(call, u, out, ctx);

    const signal = { type, digit: input.dtmf, intent: u.intent, confidence: u.confidence, sentiment: u.sentiment, agentRequested: u.agentRequested,
      progress: Boolean(step && step.progress), wrongDetails: Boolean(step && step.wrongDetails), deadAirMs: step ? step.deadAirMs : undefined, elapsedSeconds };
    const { scorecard, decision } = policy.evaluate(call.scorecard, signal, call.rules);
    call.scorecard = scorecard;
    out.event('rules', explain(decision, scorecard, call.rules), `decision=${decision.action}${decision.reason ? ' reason=' + decision.reason : ''}`);

    if (step && step.end) return endWith(call, out, step.end);
    if (decision.action === 'transfer') {
      out.say(SAY.forcedTransfer);
      return escalate(call, out, decision.reason, policy.PLANNED_REASONS.has(decision.reason));
    }
    if (decision.action === 'offer_agent') { out.say(SAY.offerAgent); return out.result(call); }
    if (decision.action === 'reprompt') {
      out.say(decision.reason === 'caller_silent' ? SAY.silence : decision.reason === 'low_confidence' ? SAY.lowConfidence
        : (expecting(call) === 'order_number' ? SAY.notUnderstoodSlot : SAY.notUnderstood));
      return out.result(call);
    }
    (step ? step.say : []).forEach((s) => out.say(s));
    return out.result(call);
  }

  function expecting(call) {
    return { need_order: 'order_number', need_zip: 'zip', offer_credit: 'yes_no', confirm_received: 'yes_no', anything_else: 'yes_no' }[call.state] || null;
  }

  // ---------------- the conversation itself ----------------
  async function advance(call, u, out, ctx) {
    const e = u.entities;
    const step = { say: [], progress: false };
    const goalStart = (intent) => {
      if (intent === 'damaged_item') { step.end = { type: 'escalate', reason: 'damaged_item', say: "I'm sorry about that. Our returns team can arrange a replacement or refund, so I'm connecting you now. I'll pass along your details." }; return true; }
      if (intent === 'out_of_scope') { step.end = { type: 'escalate', reason: 'out_of_scope', say: "I can't do that one myself yet, so I'm connecting you to a team member who can. I'll pass along your details." }; return true; }
      if (GOALS.has(intent) || (intent === 'Dialog' && e.orderNumber)) {
        call.goal = GOALS.has(intent) ? intent : (call.goal || 'check_order');
        call.slots = { orderNumber: e.orderNumber || null, zip: e.zip || null };
        step.progress = true;
        return false;
      }
      return null;
    };

    if (call.state === 'need_intent' || (call.state === 'anything_else' && GOALS.has(u.intent))) {
      const g = goalStart(u.intent);
      if (g === true) return step;
      if (g === null) {
        if (call.state === 'anything_else' && e.no) { step.end = { type: 'contained', say: SAY.goodbye }; return step; }
        if (call.state === 'anything_else' && e.yes) { call.state = 'need_intent'; step.say.push('Sure, what else can I help with?'); step.progress = true; return step; }
        step.say.push(SAY.notUnderstood); return step;
      }
      out.event('bot', `Goal understood: ${call.goal === 'not_received' ? 'parcel shows delivered but is missing' : 'track an order'}`, `goal=${call.goal}`);
      return collectOrNext(call, step, out, ctx);
    }

    switch (call.state) {
      case 'need_order':
        if (e.orderNumber) { call.slots.orderNumber = e.orderNumber; if (e.zip) call.slots.zip = e.zip; step.progress = true; return collectOrNext(call, step, out, ctx); }
        step.say.push(SAY.askOrderAgain); return step;
      case 'need_zip':
        if (e.zip) { call.slots.zip = e.zip; step.progress = true; return collectOrNext(call, step, out, ctx); }
        step.say.push(SAY.askZip); return step;
      case 'offer_credit':
        if (e.yes) {
          out.event('tool', 'Bot asks the order system to add a $' + call.order.creditUsd + ' credit', `POST /orders/${call.order.orderNumber}/credits {amount: ${call.order.creditUsd}}`);
          const r = await orders.addDeliveryCredit(call.order.orderNumber, call.order.creditUsd, { noWait: ctx && ctx.noWait });
          out.event('tool', 'Order system confirms the credit', `201 Created · ${r.creditId}`);
          call.state = 'anything_else'; step.progress = true;
          step.say.push(`Done. I've added a $${call.order.creditUsd} credit to your account for the delay. ${SAY.anythingElse}`); return step;
        }
        if (e.no) { call.state = 'anything_else'; step.progress = true; step.say.push(`No problem. Your ${call.order.item} should arrive ${call.order.eta}. ${SAY.anythingElse}`); return step; }
        step.say.push('Would you like me to add the credit? Just say yes or no.'); return step;
      case 'confirm_received':
        if (e.yes) { call.state = 'anything_else'; step.progress = true; step.say.push(`Great. ${SAY.anythingElse}`); return step; }
        if (e.no || u.intent === 'not_received') { step.end = missingParcel(call); return step; }
        step.say.push('Did you find the parcel? Just say yes or no.'); return step;
      case 'anything_else':
        if (e.no) { step.end = { type: 'contained', say: SAY.goodbye }; return step; }
        if (e.yes) { call.state = 'need_intent'; step.progress = true; step.say.push('Sure, what else can I help with?'); return step; }
        step.say.push(SAY.anythingElse); return step;
      default:
        step.say.push(SAY.notUnderstood); return step;
    }
  }

  async function collectOrNext(call, step, out, ctx) {
    if (!call.slots.orderNumber) { call.state = 'need_order'; step.say.push(SAY.askOrder); return step; }
    if (!call.slots.zip) { call.state = 'need_zip'; step.say.push(SAY.askZip); return step; }
    return lookup(call, step, out, ctx);
  }

  async function lookup(call, step, out, ctx) {
    const { orderNumber, zip } = call.slots;
    out.event('tool', `Bot asks the order system about order ${orderNumber}`, `GET /orders/${orderNumber}?zip=${zip} (HTTPS, API key)`);
    const known = orders.ORDERS[orderNumber];
    const expectedMs = (known && known.slowLookupMs) || 300;
    let fillerPlayed = false, timer = null;
    const fillerAfter = call.settings.fillerAfterMs;
    if (call.settings.filler && expectedMs > fillerAfter) {
      const playFiller = () => { fillerPlayed = true; out.event('bot', `Lookup is slow (> ${fillerAfter / 1000} s), so the bot fills the silence`, 'Pre-recorded filler prompt'); out.say(SAY.filler); };
      if (ctx && ctx.noWait) playFiller(); else timer = setTimeout(playFiller, fillerAfter);
    }
    const r = await orders.lookupOrder(orderNumber, zip, { noWait: ctx && ctx.noWait });
    if (timer) clearTimeout(timer);
    step.deadAirMs = fillerPlayed ? fillerAfter : r.latencyMs;
    out.event('tool', r.ok ? `Order system answers in ${r.latencyMs} ms: ${r.order.status.replace(/_/g, ' ')}` : `Order system answers in ${r.latencyMs} ms: no match`,
      r.ok ? `200 OK {status: "${r.order.status}"}` : `404 / ZIP mismatch (${r.error})`);
    if (!r.ok) {
      step.wrongDetails = true; call.slots = { orderNumber: null, zip: null }; call.state = 'need_order';
      step.say.push(SAY.mismatch); return step;
    }
    call.order = r.order; call.verified = true; step.progress = true;
    out.event('bot', 'Caller verified (order number + ZIP match)', 'verified=true');
    return answer(call, step);
  }

  function answer(call, step) {
    const o = call.order;
    const prefix = call.goal === 'not_received' && o.status !== 'delivered' ? "It hasn't been delivered yet. " : '';
    switch (o.status) {
      case 'delivered':
        if (call.goal === 'not_received') { step.end = missingParcel(call); return step; }
        call.state = 'confirm_received';
        step.say.push(`It was delivered ${o.deliveredAt} and left at the ${o.leftAt}. Did you find it?`); return step;
      case 'out_for_delivery':
        call.state = 'anything_else'; step.say.push(`${prefix}Good news: your ${o.item} are out for delivery with ${o.carrier} and should arrive ${o.eta}. ${SAY.anythingElse}`); return step;
      case 'in_transit':
        call.state = 'anything_else'; step.say.push(`${prefix}Your ${o.item} is on its way with ${o.carrier} and is due ${o.eta}. ${SAY.anythingElse}`); return step;
      case 'processing':
        call.state = 'anything_else'; step.say.push(`${prefix}Your ${o.item} hasn't shipped yet. It's scheduled to ship ${o.shipsOn} and should arrive ${o.arrives}. ${SAY.anythingElse}`); return step;
      case 'delayed':
        call.state = 'offer_credit';
        step.say.push(`${prefix}I'm sorry, your ${o.item} is running ${o.daysLate} days late. ${o.carrier} now expects to deliver it ${o.eta}. Because of the delay, I can add a $${o.creditUsd} credit to your account. Would you like that?`); return step;
      default:
        step.end = { type: 'escalate', reason: 'out_of_scope', say: "Let me connect you with a team member who can look into this order." }; return step;
    }
  }

  function missingParcel(call) {
    const o = call.order;
    return { type: 'escalate', reason: 'missing_package', say: `I can see it was marked delivered ${o.deliveredAt}, left at the ${o.leftAt}. I'm sorry it's not there. A delivery specialist can open a claim and send a replacement, so I'm connecting you now. I'll pass along everything, so you won't need to repeat yourself.` };
  }

  // ---------------- endings ----------------
  function endWith(call, out, end) {
    if (end.say) out.say(end.say);
    if (end.type === 'contained') {
      out.event('connector', 'Bot finishes: problem solved, no person needed', 'disconnect {action: finished, outputVariables: {VA_Outcome: "contained"}}');
      out.event('genesys', 'Flow plays a 1-question survey, then the call ends', 'Architect: VA_Outcome == "contained" → survey → Disconnect');
      return finish(call, out, { type: 'contained', planned: false, reason: null, summary: summary(call, null) });
    }
    return escalate(call, out, end.reason, true);
  }

  function escalate(call, out, reason, planned) {
    const queue = QUEUE_FOR[reason] || 'Order Support';
    const contextKey = id(10);
    const sum = summary(call, reason);
    out.event('handoff', 'Bot saves a short summary of the call for the agent', `context key ${contextKey} → context store (encrypted, expires in 1 h)`);
    out.event('connector', 'Bot ends its part and hands the call back to the flow', `disconnect {action: transfer, outputVariables: {VA_Outcome: "escalate", VA_Reason: "${reason}", VA_Queue: "${queue}", VA_ContextKey: "${contextKey}"}}`);
    out.event('genesys', `Flow transfers the call to '${queue}' at high priority (no second long wait)`, 'Transfer to ACD · priority 10 · participant data attached');
    out.event('agent', 'Agent screen pops with the summary, so the caller repeats nothing', sum);
    return finish(call, out, { type: 'escalated', planned, reason, queue, summary: sum, contextKey });
  }

  function summary(call, reason) {
    const o = call.order, parts = [];
    parts.push(call.verified ? `Verified caller (order ${o.orderNumber}, ZIP matched).` : 'Caller NOT verified.');
    if (o) parts.push(`Order: ${o.item}, status ${o.status.replace(/_/g, ' ')}${o.deliveredAt ? ' (' + o.deliveredAt + ', ' + o.leftAt + ')' : ''}.`);
    const why = { missing_package: 'Caller says the parcel never arrived: open a claim / send replacement.', damaged_item: 'Item arrived damaged or wrong: arrange return.',
      out_of_scope: 'Request the bot cannot do yet (cancel / return / address change).', asked_for_agent: 'Caller asked for a person twice.',
      upset_and_asked_for_agent: 'Caller upset and asked for a person.', could_not_verify: 'Order number / ZIP did not match twice: verify manually.',
      caller_unhappy: 'Caller sounded unhappy for two turns.', not_understood: 'Bot did not understand the caller twice.', caller_silent: 'Caller went silent.',
      going_in_circles: 'Conversation was going in circles.', no_progress: 'No progress for three turns.', too_much_silence_from_bot: 'Bot was too slow to answer.',
      call_too_long: 'Bot conversation ran over 4 minutes.', sensitive_topic: 'Possible fraud: handle with care.', low_confidence: 'Bot unsure what the caller meant.' };
    if (reason) parts.push(why[reason] || reason);
    const last = call.transcript.filter((t) => t.who === 'caller').slice(-1)[0];
    if (last) parts.push(`Last said: "${last.text}"`);
    return parts.join(' ');
  }

  function finish(call, out, outcome) {
    call.ended = true; call.outcome = outcome; call.state = 'ended';
    out.event('result', outcome.type === 'contained' ? 'Result: CONTAINED (solved by the bot)' : outcome.type === 'escalated'
      ? `Result: ESCALATED (${outcome.planned ? 'planned' : 'bot struggled'}: ${outcome.reason})` : outcome.type === 'abandoned' ? 'Result: ABANDONED (caller hung up in the bot)' : 'Result: HANDLED BY A PERSON (not offered to the bot)', '');
    return out.result(call);
  }

  // ---------------- explanation helpers ----------------
  function describe(u) {
    const bits = [];
    const names = { check_order: 'track an order', not_received: 'parcel missing', damaged_item: 'item damaged / wrong', out_of_scope: 'something the bot does not handle', fraud_report: 'possible fraud',
      Dialog: 'answering the question', agent: 'wants a person', unknown: 'not understood' };
    bits.push(`Bot understands: ${names[u.intent] || u.intent}${u.confidence !== null ? ' (' + pct(u.confidence) + ' sure)' : ''}`);
    if (u.entities.orderNumber) bits.push(`order number ${u.entities.orderNumber}`);
    if (u.entities.zip) bits.push(`ZIP ${u.entities.zip}`);
    if (u.agentRequested) bits.push('asked for a person');
    if (typeof u.sentiment === 'number' && u.sentiment <= -0.3) bits.push('caller sounds upset');
    return bits.join(' · ');
  }

  function explain(d, c, r) {
    if (d.action === 'transfer') return `Rule triggered → hand over to a person (${d.reason.replace(/_/g, ' ')})`;
    if (d.action === 'offer_agent') return `First request for a person (${c.agentRequests}/${r.agentRequestsBeforeTransfer}) → offer help or transfer`;
    if (d.action === 'reprompt') return `Didn't work this time (${d.reason.replace(/_/g, ' ')}) → ask again`;
    return 'All rules OK → bot continues';
  }

  function collector(ctx) {
    const events = [], says = [];
    return {
      event(layer, title, tech) { const ev = { layer, title, tech }; events.push(ev); if (ctx && ctx.onEvent) ctx.onEvent(ev); },
      say(text) { says.push(text); const ev = { layer: 'say', title: text }; events.push(ev); if (ctx && ctx.onEvent) ctx.onEvent(ev); },
      result(call) { if (says.length) call.transcript.push({ who: 'bot', text: says.join(' ') }); return { events, says, ended: call.ended, outcome: call.outcome }; },
    };
  }

  function newStats() { return { calls: 0, toBot: 0, contained: 0, planned: 0, forced: 0, abandoned: 0, human: 0, reasons: {} }; }
  function record(stats, outcome) {
    stats.calls += 1;
    if (outcome.type === 'human_direct') { stats.human += 1; return stats; }
    stats.toBot += 1;
    if (outcome.type === 'contained') stats.contained += 1;
    if (outcome.type === 'abandoned') stats.abandoned += 1;
    if (outcome.type === 'escalated') { stats[outcome.planned ? 'planned' : 'forced'] += 1; stats.reasons[outcome.reason] = (stats.reasons[outcome.reason] || 0) + 1; }
    return stats;
  }

  return { createCall, startCall, handleInput, newStats, record, SAY, QUEUE_FOR };
});
