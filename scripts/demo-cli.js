// Plays every scenario in the terminal and prints what each part did.   npm run demo  [scenarioId]
const brain = require('../src/brain');
const allocator = require('../src/allocator');
const scenarios = require('../src/scenarios');
const S = { botPercent: 30, holdoutPercent: 10 };
const C = { phone: 34, genesys: 36, split: 33, connector: 36, understand: 35, rules: 35, bot: 35, tool: 33, handoff: 31, agent: 31, say: 32, result: 1 };
const paint = (layer, s) => (process.stdout.isTTY ? `\x1b[${C[layer] || 0}m${s}\x1b[0m` : s);
(async () => {
  const only = process.argv[2];
  for (const sc of scenarios.filter((s) => !only || s.id === only)) {
    console.log('\n' + '='.repeat(78) + `\n${sc.title}\n${sc.story}\n` + '='.repeat(78));
    const call = brain.createCall({ phone: allocator.findPhone(sc.route, S), settings: S });
    const show = (r) => r.events.forEach((e) => console.log(e.layer === 'say' ? paint('say', `   BOT  ▸ ${e.title}`) : paint(e.layer, `   [${e.layer}] ${e.title}`) + (e.tech ? `\n            ${e.tech}` : '')));
    show(brain.startCall(call, {}));
    for (const st of sc.steps) {
      if (call.ended) break;
      console.log(`\n   CALLER ▸ ${st.text || st.dtmf || (st.hangup ? '[hangs up]' : '[silence]')}`);
      show(await brain.handleInput(call, st, { noWait: true }));
    }
  }
})();
