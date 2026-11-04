/**
 * nlu.js — "Natural Language Understanding": turns what the caller said into
 *   intent     (what they want), with a confidence 0..1
 *   entities   (order number, ZIP code, yes/no)
 *   sentiment  (-1 = very upset ... +0.5 = happy)
 *   agentRequested (did they ask for a person?)
 *
 * This is deliberately simple keyword matching so the demo runs anywhere with no API keys.
 * In production you swap this ONE function for Amazon Lex, Genesys NLU, or an LLM —
 * the rest of the bot stays the same.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.OrderHelp = root.OrderHelp || {}; root.OrderHelp.nlu = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INTENTS = [
    // [intent, strong phrases (0.92), weak keywords (0.66)]
    ['fraud_report', ['someone used my card', 'fraud', 'i did not place this order', "i didn't place this order", 'unauthorized'], []],
    ['not_received', ['says delivered', 'said delivered', 'never got', 'never arrived', 'did not get', "didn't get", 'not received', "haven't received it", 'missing package', 'stolen', 'not here'], ['missing']],
    ['damaged_item', ['arrived broken', 'arrived damaged', 'wrong item', 'is broken', 'is damaged', 'cracked'], ['broken', 'damaged']],
    ['out_of_scope', ['cancel my order', 'cancel the order', 'change my address', 'return policy', 'start a return'], ['cancel', 'return', 'refund']],
    ['check_order', ['where is my order', "where's my order", 'track my order', 'order status', 'track my package', 'where is my package', "where's my package", 'has my order shipped', 'when will it arrive', "hasn't arrived", 'still hasn', 'not arrived yet'], ['order', 'package', 'parcel', 'delivery', 'shipping', 'track', 'arrive', 'shipped', 'backpack', 'shoes', 'coffee maker', 'lamp', 'headphones']],
  ];
  const AGENT_WORDS = /\b(agent|human|representative|real person|a person|operator|someone real|speak to someone|talk to someone)\b/;
  const YES = /^(yes|yeah|yep|sure|ok|okay|please|yes please|that would be great|correct|right|i did|sounds good)\b/;
  const NO = /^(no|nope|nah|no thanks|no thank you|not really|that's all|that is all|nothing else|i'm good|im good|i'm fine)\b/;
  const BYE = /\b(bye|goodbye|that's all|that is all|nothing else|thanks|thank you)\b/;
  const NEGATIVE = { ridiculous: 0.5, terrible: 0.5, useless: 0.6, worst: 0.6, angry: 0.5, furious: 0.7, annoyed: 0.4, frustrated: 0.4,
    unacceptable: 0.5, ugh: 0.3, seriously: 0.2, again: 0.15, 'still': 0.1, stupid: 0.6, hate: 0.6, now: 0.1, '!': 0.15 };
  const POSITIVE = { thanks: 0.2, 'thank you': 0.3, great: 0.3, perfect: 0.3, awesome: 0.3, good: 0.15 };
  const NUMBER_WORDS = { zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

  /** "one zero zero two one" or "1 0 0 2 1" -> "10021" so spoken numbers work. */
  function normaliseDigits(text) {
    const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const out = []; let run = '';
    for (const w of words) {
      const d = NUMBER_WORDS[w] !== undefined ? NUMBER_WORDS[w] : (/^\d+$/.test(w) ? w : null);
      if (d !== null) { run += d; continue; }
      if (run) { out.push(run); run = ''; }
      out.push(w);
    }
    if (run) out.push(run);
    return out.join(' ');
  }

  function sentimentOf(t) {
    let score = 0;
    for (const [w, v] of Object.entries(NEGATIVE)) if (t.includes(w)) score -= v;
    for (const [w, v] of Object.entries(POSITIVE)) if (t.includes(w)) score += v;
    if (/[A-Z]{4,}/.test(t)) score -= 0.3; // SHOUTING
    return Math.max(-1, Math.min(0.5, Math.round(score * 100) / 100));
  }

  /**
   * @param {string} text  what the caller said (speech-to-text output) or keypad digits
   * @param {string} expecting  what the bot just asked for: 'order_number' | 'zip' | 'yes_no' | null
   */
  function understand(text, expecting) {
    const raw = String(text || '');
    const t = raw.toLowerCase().trim();
    const n = normaliseDigits(raw);
    const nums = (n.match(/\b\d{5}\b/g) || []);
    const entities = {};
    if (nums.length) {
      if (expecting === 'zip') entities.zip = nums[nums.length - 1];
      else { entities.orderNumber = nums[0]; if (nums[1]) entities.zip = nums[1]; }
    }
    if (YES.test(t)) entities.yes = true;
    if (NO.test(t)) entities.no = true;

    let intent = 'unknown', confidence = 0.2;
    for (const [name, strong, weak] of INTENTS) {
      if (strong.some((p) => t.includes(p))) { intent = name; confidence = 0.92; break; }
      if (weak.some((p) => new RegExp('\\b' + p + '\\b').test(t))) { intent = name; confidence = 0.66; break; }
    }
    const agentRequested = AGENT_WORDS.test(t);
    // Short answers to a question the bot asked are understood "in context".
    if (intent === 'unknown' && (entities.orderNumber || entities.zip || entities.yes || entities.no)) { intent = 'Dialog'; confidence = 0.9; }
    if (intent === 'unknown' && agentRequested) { intent = 'agent'; confidence = 0.9; }
    if (intent === 'unknown' && BYE.test(t)) { intent = 'Dialog'; confidence = 0.8; entities.no = true; }
    return { text: raw, intent, confidence, entities, sentiment: sentimentOf(raw), agentRequested };
  }

  return { understand, normaliseDigits, sentimentOf };
});
