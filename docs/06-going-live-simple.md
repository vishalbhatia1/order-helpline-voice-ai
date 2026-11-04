# Before real customers: a simple checklist

## 1. How much traffic should go to the bot?

**Start small and grow only when the numbers are good.**

| Stage | Share of calls to the bot | Move on when… |
|---|---|---|
| Shadow | 0% (bot listens to recordings only) | it would have solved most WISMO calls |
| Canary | 5% | no broken calls for a week |
| Pilot | 10% | containment ≥ 50%, hang-ups in bot < 6% |
| Scale | 30% | two good weeks in a row |
| Mainstream | 50%+ | business sign-off |

Always keep a **10% holdout** that never meets the bot, and compare it with the bot group:
are hang-ups, repeat calls within 72 hours and satisfaction **no worse**?

**Kill switch:** in Connect set *Distribute by percentage* to 0%; in Genesys change the decision to `false`.

## 2. Numbers to watch every week

| Number | Healthy for WISMO |
|---|---|
| Containment (solved ÷ calls to bot) | 60%+ |
| Same caller calls back within 72 h | low, close to the holdout group |
| Hung up in the bot | < 6% |
| Bot struggled (forced hand-overs) | < 10% |
| Bot reply time | under ~1 second |
| Top 3 hand-over reasons | fix the biggest one first |

## 3. Hand-over rules (already in `src/policy.js`)

Two misunderstandings, two wrong details, two silences, two unhappy turns, three turns with no progress,
240 seconds, or the second request for a person → transfer **with a summary at high priority**.
Fraud → immediately. Slow systems → say *"One moment…"* after 1 second.

## 4. Security checklist

- [ ] The bot says it is an AI and that the call is recorded.
- [ ] Verify before revealing order details (order number + ZIP, or phone match).
- [ ] Never read out full addresses, card numbers or payment details.
- [ ] Put **no personal data** in logs or in queue / UUI fields; use order numbers and short summaries.
- [ ] The order API uses HTTPS and a key stored in a secrets manager, not in code.
- [ ] IAM roles allow only what is needed (Lex → this Lambda; Genesys → this Lex bot).
- [ ] Encrypt call recordings and contact data; set retention periods.
- [ ] Payments never go through the bot (use a secure / PCI flow).
- [ ] Every bot step has a failure path to a person.
- [ ] Load-test before peak season (Black Friday is when WISMO calls double).

## 5. When the simple bot isn't enough

- **Understanding:** swap `src/nlu.js` for Lex's own intents or an LLM; keep the rest.
- **Voice quality:** move to Genesys Audio Connector or Amazon Connect AI agents with Nova Sonic speech-to-speech.
- **More tasks:** add returns, address changes and cancellations one at a time, each with its own hand-over rule.
