/**
 * allocator.js — decides if THIS call goes to the bot or straight to a person.
 *
 * "Send 30% of calls to the bot" is just: put every caller in a bucket 0-99 and send
 * buckets below 30 to the bot. Hashing the phone number makes it STICKY: the same
 * caller always lands in the same bucket, so repeat callers get a consistent experience.
 * A small HOLDOUT group never meets the bot, so you can compare results fairly.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.OrderHelp = root.OrderHelp || {}; root.OrderHelp.allocator = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // FNV-1a: a tiny, fast hash that gives the same answer in browsers and in Node.
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  /**
   * @param {string} phone caller number, e.g. +14155550101
   * @param {object} cfg { botPercent: 30, holdoutPercent: 10, killSwitch: false, experiment: 'wismo-pilot' }
   */
  function allocate(phone, cfg) {
    const c = Object.assign({ botPercent: 30, holdoutPercent: 10, killSwitch: false, experiment: 'wismo-pilot' }, cfg || {});
    const digits = String(phone || '').replace(/[^0-9+]/g, '');
    const bucket = hash(c.experiment + ':' + (digits || Math.random())) % 100;
    if (c.killSwitch) return { route: 'HUMAN', bucket, reason: 'kill switch is ON (bot paused)' };
    if (bucket < c.holdoutPercent) return { route: 'HUMAN', bucket, reason: `bucket ${bucket} is in the ${c.holdoutPercent}% holdout group` };
    // botPercent applies to everyone outside the holdout
    const position = (bucket - c.holdoutPercent) / (100 - c.holdoutPercent);
    if (position < c.botPercent / 100) return { route: 'BOT', bucket, reason: `bucket ${bucket} is inside the ${c.botPercent}% bot share` };
    return { route: 'HUMAN', bucket, reason: `bucket ${bucket} is outside the ${c.botPercent}% bot share` };
  }

  /** Find a demo phone number that routes the way you want (handy for the simulator). */
  function findPhone(route, cfg, start) {
    for (let i = start || 100; i < 100000; i++) {
      const p = '+1415555' + String(i).padStart(4, '0');
      if (allocate(p, cfg).route === route) return p;
    }
    return null;
  }

  return { allocate, hash, findPhone };
});
