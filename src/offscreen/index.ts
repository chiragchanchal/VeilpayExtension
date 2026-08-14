/**
 * Offscreen document — hosts the D3 spike.
 *
 * Exists because the service worker has no DOM and gets killed for running long.
 * Reports once and lets the background close it.
 *
 * The report is projected through `toZkCapability` rather than mapped by hand
 * here, so the classification that the D3 decision table reads lives next to the
 * probes it describes and can be unit-tested without a browser.
 */

import { runCspSpike, toZkCapability } from '@/spike/csp-zk-probe';

const INTERNAL_CHANNEL = 'veilpay:internal';

void (async () => {
  const report = await runCspSpike();

  await chrome.runtime.sendMessage({
    // Marks this as control-plane traffic so the background routes it away from
    // the request bus, which would otherwise reject it as a malformed Request.
    channel: INTERNAL_CHANNEL,
    kind: 'spike:zk-result',
    result: toZkCapability(report),
  });
})();
