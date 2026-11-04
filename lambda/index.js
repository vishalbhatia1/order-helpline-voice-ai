/**
 * AWS Lambda behind an Amazon Lex V2 bot.  Used by BOTH:
 *   - Amazon Connect  ("Get customer input" block)
 *   - Genesys Cloud   ("Call Lex V2 Bot" action)
 *
 * Lex turns the caller's speech into text and speaks our replies (text-to-speech).
 * This function runs the SAME brain as the simulator, so what you saw in the demo is what runs live.
 *
 *  - Conversation continuing -> dialogAction ElicitIntent (Lex speaks the reply and listens again)
 *  - Solved                   -> Close with intent "OrderResolved"
 *  - Hand over to a person    -> Close with intent "EscalateToAgent" + session attributes:
 *        va_outcome, va_reason, va_queue, va_summary, va_order, va_context_key, va_planned
 *    The call flow reads these to pick the queue and show the summary to the agent.
 */
let brain;
try { brain = require('./src/brain'); } catch (e) { brain = require('../src/brain'); } // zip layout vs repo layout

exports.handler = async (event) => {
  const attrs = Object.assign({}, (event.sessionState && event.sessionState.sessionAttributes) || {});
  let call;
  if (attrs.va_call) {
    call = JSON.parse(attrs.va_call);
  } else {
    // First turn. The flow already played the greeting and did the traffic split.
    call = brain.createCall({ phone: attrs.callerPhone, now: Date.now(), settings: { filler: false } });
    brain.startCall(call, { skipSplit: true });
  }

  const text = (event.inputTranscript || '').trim();
  const input = event.inputMode === 'DTMF' ? { dtmf: text } : (text ? { text } : { silence: true });
  const res = await brain.handleInput(call, input, { noWait: true });
  call.transcript = call.transcript.slice(-4); // keep session attributes small

  // One structured log line per turn -> CloudWatch Logs (search by callId)
  console.log(JSON.stringify({ callId: call.id, turn: call.scorecard.turns, events: res.events.filter((e) => e.layer !== 'say').map((e) => e.title) }));

  const messages = [{ contentType: 'PlainText', content: res.says.join(' ') || brain.SAY.notUnderstood }];

  if (res.ended) {
    const o = res.outcome;
    const out = Object.assign({}, attrs, {
      va_outcome: o.type === 'escalated' ? 'escalate' : o.type,
      va_reason: o.reason || '',
      va_queue: o.queue || '',
      va_summary: (o.summary || '').slice(0, 500),
      va_order: (call.order && call.order.orderNumber) || call.slots.orderNumber || '',
      va_context_key: o.contextKey || '',
      va_planned: String(Boolean(o.planned)),
    });
    delete out.va_call;
    return {
      sessionState: { sessionAttributes: out, dialogAction: { type: 'Close' },
        intent: { name: o.type === 'contained' ? 'OrderResolved' : 'EscalateToAgent', state: 'Fulfilled' } },
      messages,
    };
  }

  attrs.va_call = JSON.stringify(call);
  return { sessionState: { sessionAttributes: attrs, dialogAction: { type: 'ElicitIntent' } }, messages };
};
