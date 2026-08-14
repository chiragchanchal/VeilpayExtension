/**
 * D3 spike — can snarkjs run under the MV3 Content Security Policy?
 *
 * The question in three parts:
 *   1. Does `WebAssembly.compile` work with only `wasm-unsafe-eval` granted?
 *   2. Does snarkjs load at all, or does its module graph hit `eval` at import time?
 *   3. Can a real Groth16 witness + proof complete end to end?
 *
 * (1) is probed here directly. (2) and (3) need circuit artifacts (.wasm + .zkey),
 * which are not vendored yet, so `probeSnarkjs` reports `artifactsMissing` rather
 * than guessing. That distinction matters: "we could not test it" is a different
 * answer from "it does not work", and only the latter should push ZK to Phase 5.
 *
 * Runs in an offscreen document because the service worker has no DOM and a long
 * proof would be killed by the SW idle timeout.
 */

import type { ZkCapability, ZkProbeStatus } from '@/core/messaging/protocol';

export interface WasmProbe {
  compileWorks: boolean;
  instantiateWorks: boolean;
  failureReason: string | null;
}

/**
 * Smallest valid WebAssembly module: exports `f() -> i32` returning 42.
 * Hand-assembled so the probe needs no build step or fetch.
 */
const MINIMAL_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // magic
  0x01, 0x00, 0x00, 0x00, // version
  // Type section: one type, () -> i32
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
  // Function section: one function, type 0
  0x03, 0x02, 0x01, 0x00,
  // Export section: export "f" as func 0
  0x07, 0x05, 0x01, 0x01, 0x66, 0x00, 0x00,
  // Code section: i32.const 42; end
  0x0a, 0x07, 0x01, 0x05, 0x00, 0x41, 0x2a, 0x0b,
]);

export async function probeWasm(): Promise<WasmProbe> {
  const result: WasmProbe = {
    compileWorks: false,
    instantiateWorks: false,
    failureReason: null,
  };

  try {
    const module = await WebAssembly.compile(MINIMAL_WASM as BufferSource);
    result.compileWorks = true;

    const instance = await WebAssembly.instantiate(module, {});
    const f = instance.exports.f;
    if (typeof f !== 'function') {
      result.failureReason = 'Module instantiated but the expected export was missing.';
      return result;
    }
    if ((f as () => number)() !== 42) {
      result.failureReason = 'Module ran but returned an unexpected value.';
      return result;
    }
    result.instantiateWorks = true;
  } catch (cause) {
    result.failureReason = cause instanceof Error ? cause.message : String(cause);
  }

  return result;
}

export interface SnarkjsProbe {
  /** Did the module graph import without tripping the CSP? */
  importWorks: boolean;
  /** Did a full witness + proof complete? Null when artifacts are absent. */
  proofWorks: boolean | null;
  artifactsMissing: boolean;
  failureReason: string | null;
  elapsedMs: number | null;
}

/**
 * Attempts to import snarkjs and, if circuit artifacts are present under
 * `/circuits/`, generate a real proof.
 */
export async function probeSnarkjs(): Promise<SnarkjsProbe> {
  const result: SnarkjsProbe = {
    importWorks: false,
    proofWorks: null,
    artifactsMissing: false,
    failureReason: null,
    elapsedMs: null,
  };

  let groth16: {
    fullProve: (
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ) => Promise<unknown>;
  };

  try {
    // Dynamic import: a CSP rejection must be catchable, not a load-time crash
    // that takes the whole offscreen document down.
    const snarkjs = (await import('snarkjs')) as unknown as {
      groth16: typeof groth16;
    };
    groth16 = snarkjs.groth16;
    result.importWorks = true;
  } catch (cause) {
    result.failureReason =
      cause instanceof Error
        ? `snarkjs import failed: ${cause.message}`
        : 'snarkjs import failed.';
    return result;
  }

  const wasmPath = chrome.runtime.getURL('circuits/transfer.wasm');
  const zkeyPath = chrome.runtime.getURL('circuits/transfer.zkey');

  // HEAD rather than GET: a proving key runs to tens of megabytes and all we need
  // to know here is whether it is vendored at all.
  const [wasmHead, zkeyHead] = await Promise.all([
    fetch(wasmPath, { method: 'HEAD' }).catch(() => null),
    fetch(zkeyPath, { method: 'HEAD' }).catch(() => null),
  ]);

  if (wasmHead === null || !wasmHead.ok || zkeyHead === null || !zkeyHead.ok) {
    result.artifactsMissing = true;
    result.failureReason =
      'Circuit artifacts are not vendored yet, so proof generation was not exercised.';
    return result;
  }

  const startedAt = performance.now();
  try {
    await groth16.fullProve({ in: 1 }, wasmPath, zkeyPath);
    result.proofWorks = true;
  } catch (cause) {
    result.proofWorks = false;
    result.failureReason =
      cause instanceof Error ? `proof failed: ${cause.message}` : 'proof failed.';
  }
  result.elapsedMs = Math.round(performance.now() - startedAt);

  return result;
}

export interface CspSpikeReport {
  wasm: WasmProbe;
  snarkjs: SnarkjsProbe;
  /** True only when a real proof completed. Unknown counts as not proven. */
  zkViableInMv3: boolean;
  measuredAt: number;
  userAgent: string;
}

export async function runCspSpike(): Promise<CspSpikeReport> {
  const wasm = await probeWasm();
  const snarkjs = await probeSnarkjs();

  return {
    wasm,
    snarkjs,
    zkViableInMv3: wasm.instantiateWorks && snarkjs.importWorks && snarkjs.proofWorks === true,
    measuredAt: Date.now(),
    userAgent: navigator.userAgent,
  };
}

/**
 * Reduces a report to the one discriminant the D3 decision table branches on.
 *
 * Order matters: a CSP refusal is checked before a missing artifact, because if
 * WASM or the import is blocked then vendoring circuits would not have helped and
 * the honest reading is "blocked", not "untested".
 */
export function classifyReport(report: CspSpikeReport): ZkProbeStatus {
  if (!report.wasm.instantiateWorks) return 'blocked-csp';
  if (!report.snarkjs.importWorks) return 'blocked-csp';
  if (report.snarkjs.artifactsMissing) return 'untested-artifacts';
  if (report.snarkjs.proofWorks === true) return 'viable';
  return 'proof-failed';
}

/** Projects the full report onto the shape that crosses the message bus. */
export function toZkCapability(report: CspSpikeReport): ZkCapability {
  return {
    status: classifyReport(report),
    wasmCompileWorks: report.wasm.instantiateWorks,
    snarkjsImportWorks: report.snarkjs.importWorks,
    proofGenerationWorks: report.snarkjs.proofWorks,
    proofElapsedMs: report.snarkjs.elapsedMs,
    failureReason: report.snarkjs.failureReason ?? report.wasm.failureReason,
    measuredAt: report.measuredAt,
  };
}
