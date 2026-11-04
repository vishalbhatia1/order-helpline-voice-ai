/**
 * scenarios.js — nine real-life calls you can replay in the simulator (and in the tests).
 * route: 'BOT' or 'HUMAN' picks a caller phone number that the traffic split sends that way.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.OrderHelp = root.OrderHelp || {}; root.OrderHelp.scenarios = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return [
    { id: 'happy', title: '1. Parcel out for delivery', story: 'The most common call: "where is my order?" The bot verifies the caller, checks the order and answers in under a minute.',
      route: 'BOT', steps: [{ text: 'Hi, where is my order?' }, { text: '1 0 0 2 1' }, { text: '94107' }, { text: "No, that's all, thanks" }],
      expect: { type: 'contained' } },
    { id: 'late', title: '2. Late order, bot offers a credit', story: 'The order is 2 days late. Policy allows a $10 goodwill credit, so the bot offers it and applies it itself.',
      route: 'BOT', steps: [{ text: "My coffee maker still hasn't arrived" }, { text: '10022' }, { text: '10001' }, { text: 'Yes please' }, { text: 'No thanks, bye' }],
      expect: { type: 'contained' } },
    { id: 'missing', title: '3. "Says delivered, but I never got it"', story: 'A possible lost or stolen parcel. The bot verifies and checks, then hands over to the claims team ON PURPOSE (planned) with a summary.',
      route: 'BOT', steps: [{ text: 'It says delivered but I never got it' }, { text: 'order 10023' }, { text: '60601' }],
      expect: { type: 'escalated', reason: 'missing_package', planned: true } },
    { id: 'agent', title: '4. Caller insists on a person', story: 'First request: the bot offers to help or connect. Second request: it transfers right away. Never trap a caller.',
      route: 'BOT', steps: [{ text: "Where's my order?" }, { text: 'Ugh, just get me a person' }, { text: 'No. A human, now.' }],
      expect: { type: 'escalated', reason: 'asked_for_agent', planned: false } },
    { id: 'confused', title: '5. Bot cannot understand', story: 'Two misunderstandings in a row and the bot stops guessing and hands over.',
      route: 'BOT', steps: [{ text: 'Hmm, I bought a thing' }, { text: 'the blue one from last week maybe' }],
      expect: { type: 'escalated', reason: 'not_understood', planned: false } },
    { id: 'verify', title: '6. Wrong details twice', story: 'Order number and ZIP do not match, twice. For security the bot stops and sends the caller to a person who can verify them another way.',
      route: 'BOT', steps: [{ text: 'Track my order' }, { text: '10021' }, { text: '12345' }, { text: '10021' }, { text: '54321' }],
      expect: { type: 'escalated', reason: 'could_not_verify', planned: false } },
    { id: 'slow', title: '7. Slow order system (filler)', story: 'The order system takes 2.5 s. After 1 s the bot says "One moment..." so the caller never hears dead air.',
      route: 'BOT', steps: [{ text: "Where's my backpack?" }, { text: '10025' }, { text: '98101' }, { text: "That's all" }],
      expect: { type: 'contained' } },
    { id: 'hangup', title: '8. Caller hangs up', story: 'The caller gives up mid-call. This counts as ABANDONED, a number you must watch.',
      route: 'BOT', steps: [{ text: 'Where is my order' }, { hangup: true }],
      expect: { type: 'abandoned' } },
    { id: 'human', title: '9. Caller sent straight to a person', story: 'With a 30% bot share, most callers still go to people. This one lands outside the bot share.',
      route: 'HUMAN', steps: [],
      expect: { type: 'human_direct' } },
  ];
});
