/**
 * policy.js — WHEN should the bot hand the caller to a human?
 *
 * Plain English: the bot keeps a small scorecard during the call (misunderstandings,
 * requests for a person, wrong details, unhappy turns, silences, time). When any
 * score reaches its limit, the bot stops trying and transfers the caller WITH context.
 *
 * Works in the browser (window.OrderHelp.policy) and in Node / AWS Lambda (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.OrderHelp = root.OrderHelp || {}; root.OrderHelp.policy = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Starting limits. Change them here and watch the simulator behave differently.
  const DEFAULT_RULES = {
    lowConfidence: 0.40,          // below this, the bot isn't sure what it heard
    maxLowConfidenceInARow: 2,
    maxMisunderstandingsInARow: 2, // "Sorry, I didn't get that" twice -> human
    maxSilencesInARow: 2,
    agentRequestsBeforeTransfer: 2, // 1st ask: offer; 2nd ask: transfer
    angryAgentRequest: -0.6,        // asking for a person while this upset -> transfer now
    unhappyScore: -0.5,             // a turn this negative counts as "unhappy"
    maxUnhappyInARow: 2,
    maxTurnsWithoutProgress: 3,
    maxSameTopicVisits: 2,          // 3rd return to the same topic = going in circles
    maxWrongDetails: 2,             // order number / ZIP mismatch
    maxCallSeconds: 240,
    deadAirMs: 2000,                // silence longer than this feels broken
    maxDeadAirEvents: 2,
    alwaysHumanIntents: ['fraud_report'],
    ignoreForLoops: ['Dialog', 'agent'],
  };

  const NOT_UNDERSTOOD = new Set(['unknown', 'FallbackIntent']);

  function newScorecard() {
    return { turns: 0, misunderstoodInARow: 0, silencesInARow: 0, lowConfidenceInARow: 0, unhappyInARow: 0,
      agentRequests: 0, turnsWithoutProgress: 0, deadAirEvents: 0, wrongDetails: 0, seconds: 0,
      lastIntent: null, topicVisits: {} };
  }

  const notUnderstood = (s) => s.type === 'utterance' && (!s.intent || NOT_UNDERSTOOD.has(s.intent));
  const lowConf = (s, r) => s.type === 'utterance' && !notUnderstood(s) && typeof s.confidence === 'number' && s.confidence < r.lowConfidence;
  const asksForAgent = (s) => Boolean(s.agentRequested) || (s.type === 'dtmf' && s.digit === '0');

  /** Update the scorecard with one caller turn. Returns a new scorecard. */
  function update(prev, s, r) {
    const c = JSON.parse(JSON.stringify(prev));
    c.turns += 1;
    if (typeof s.elapsedSeconds === 'number') c.seconds = Math.max(c.seconds, Math.round(s.elapsedSeconds));
    c.silencesInARow = s.type === 'silence' ? c.silencesInARow + 1 : 0;
    if (notUnderstood(s)) c.misunderstoodInARow += 1; else if (s.type === 'utterance') c.misunderstoodInARow = 0;
    if (lowConf(s, r)) c.lowConfidenceInARow += 1; else if (s.type === 'utterance' && !notUnderstood(s)) c.lowConfidenceInARow = 0;
    if (typeof s.sentiment === 'number') c.unhappyInARow = s.sentiment <= r.unhappyScore ? c.unhappyInARow + 1 : 0;
    if (asksForAgent(s)) c.agentRequests += 1;
    if (s.wrongDetails) c.wrongDetails += 1;
    if (typeof s.deadAirMs === 'number' && s.deadAirMs >= r.deadAirMs) c.deadAirEvents += 1;
    c.turnsWithoutProgress = s.progress ? 0 : c.turnsWithoutProgress + 1;
    if (s.type === 'utterance' && s.intent && !NOT_UNDERSTOOD.has(s.intent) && !r.ignoreForLoops.includes(s.intent)) {
      if (s.intent !== c.lastIntent) c.topicVisits[s.intent] = (c.topicVisits[s.intent] || 0) + 1;
      c.lastIntent = s.intent;
    }
    return c;
  }

  /** Decide: continue | reprompt | offer_agent | transfer (with a reason). */
  function decide(c, s, r) {
    const transfer = (reason) => ({ action: 'transfer', reason });
    if (s.intent && r.alwaysHumanIntents.includes(s.intent)) return transfer('sensitive_topic');
    if (asksForAgent(s)) {
      if (typeof s.sentiment === 'number' && s.sentiment <= r.angryAgentRequest) return transfer('upset_and_asked_for_agent');
      if (c.agentRequests >= r.agentRequestsBeforeTransfer) return transfer('asked_for_agent');
    }
    if (c.wrongDetails >= r.maxWrongDetails) return transfer('could_not_verify');
    if (c.unhappyInARow >= r.maxUnhappyInARow) return transfer('caller_unhappy');
    if (c.misunderstoodInARow >= r.maxMisunderstandingsInARow) return transfer('not_understood');
    if (c.silencesInARow >= r.maxSilencesInARow) return transfer('caller_silent');
    if (c.lowConfidenceInARow >= r.maxLowConfidenceInARow) return transfer('low_confidence');
    if (s.intent && (c.topicVisits[s.intent] || 0) > r.maxSameTopicVisits) return transfer('going_in_circles');
    if (c.turnsWithoutProgress >= r.maxTurnsWithoutProgress) return transfer('no_progress');
    if (c.deadAirEvents >= r.maxDeadAirEvents) return transfer('too_much_silence_from_bot');
    if (c.seconds >= r.maxCallSeconds) return transfer('call_too_long');
    if (asksForAgent(s)) return { action: 'offer_agent', reason: 'first_agent_request' };
    if (notUnderstood(s)) return { action: 'reprompt', reason: 'not_understood' };
    if (s.type === 'silence') return { action: 'reprompt', reason: 'caller_silent' };
    if (lowConf(s, r)) return { action: 'reprompt', reason: 'low_confidence' };
    return { action: 'continue', reason: null };
  }

  function evaluate(scorecard, signal, rules) {
    const r = Object.assign({}, DEFAULT_RULES, rules || {});
    const next = update(scorecard, signal, r);
    return { scorecard: next, decision: decide(next, signal, r) };
  }

  // "Planned" = by design (missing parcel -> claims team). "Forced" = the bot struggled.
  const PLANNED_REASONS = new Set(['missing_package', 'damaged_item', 'sensitive_topic', 'out_of_scope']);

  return { DEFAULT_RULES, newScorecard, evaluate, PLANNED_REASONS };
});
