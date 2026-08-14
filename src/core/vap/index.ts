/**
 * Veilpay Agent Payments (VAP) — core grants and the approval decision.
 *
 * S5a ships the grant model, the decision function, and rolling spend windows.
 * The operation state machine, audit ledger, and gas policy are later slices.
 */
export * from './grant';
export * from './decision';
export * from './confirmation';
