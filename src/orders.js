/**
 * orders.js — a pretend Order Management System (OMS).
 *
 * In real life this is your Shopify / SAP / Salesforce Commerce / in-house order API.
 * The bot only ever calls two "tools": lookupOrder() and addDeliveryCredit().
 * Each test order below triggers a different, realistic situation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.OrderHelp = root.OrderHelp || {}; root.OrderHelp.orders = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ORDERS = {
    '10021': { item: 'running shoes', zip: '94107', status: 'out_for_delivery', eta: 'today by 6 pm', carrier: 'UPS' },
    '10022': { item: 'coffee maker', zip: '10001', status: 'delayed', eta: 'tomorrow', daysLate: 2, carrier: 'FedEx', creditUsd: 10 },
    '10023': { item: 'wireless headphones', zip: '60601', status: 'delivered', deliveredAt: 'yesterday at 2:14 pm', leftAt: 'front door', carrier: 'USPS' },
    '10024': { item: 'desk lamp', zip: '73301', status: 'processing', shipsOn: 'tomorrow', arrives: 'in 3 to 5 days' },
    '10025': { item: 'hiking backpack', zip: '98101', status: 'in_transit', eta: 'Friday', carrier: 'UPS', slowLookupMs: 2500 },
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Look up an order AND check the ZIP (simple caller verification). */
  async function lookupOrder(orderNumber, zip, opts) {
    const o = ORDERS[String(orderNumber)];
    const latencyMs = (opts && typeof opts.latencyMs === 'number') ? opts.latencyMs : (o && o.slowLookupMs) || 300;
    if (!(opts && opts.noWait)) await wait(latencyMs);
    if (!o) return { ok: false, error: 'not_found', latencyMs };
    if (o.zip !== String(zip)) return { ok: false, error: 'zip_mismatch', latencyMs };
    return { ok: true, order: Object.assign({ orderNumber: String(orderNumber) }, o), latencyMs };
  }

  async function addDeliveryCredit(orderNumber, amountUsd, opts) {
    if (!(opts && opts.noWait)) await wait(250);
    return { ok: true, creditId: 'CR-' + orderNumber + '-' + amountUsd, amountUsd };
  }

  return { ORDERS, lookupOrder, addDeliveryCredit };
});
