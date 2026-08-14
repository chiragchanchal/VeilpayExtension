# D3 Spike: ZK Viability under MV3 CSP

## Status

**Pending runtime execution.** The spike cannot run in unit tests because it requires `chrome.*` APIs and real MV3 CSP enforcement. It runs as an offscreen document the first time the extension loads.

## Why This Matters

MV3's Content Security Policy restricts `eval()` and `wasm-unsafe-eval`. This blocks:
- Most metaprogramming (dynamic code generation)
- Some WASM loading patterns (depending on browser implementation)

snarkjs may fail to import if its bundle uses `eval()`, or WASM may fail to compile if the environment doesn't grant `wasm-unsafe-eval`.

If either fails, ZK proofs cannot run in-extension and must defer to Phase 5 (moving proof generation to a server or companion app).

## The Probe

`src/spike/csp-zk-probe.ts` exports:

- **`probeWasm()`**: Compiles and instantiates a minimal WASM module. Reports whether `WebAssembly.compile` and `WebAssembly.instantiate` work.
- **`probeSnarkjs()`**: Attempts to dynamically import snarkjs and, if circuit artifacts exist, generates a real Groth16 proof. Reports:
  - `importWorks`: Did the module load without hitting the CSP?
  - `proofWorks`: Did a full proof complete? (`null` if artifacts are missing, `boolean` otherwise)
  - `artifactsMissing`: Are `.wasm` and `.zkey` files absent?

- **`runCspSpike()`**: Runs both probes, combines results into a `CspSpikeReport`, and computes `zkViableInMv3`:
  ```
  true iff: WASM works AND snarkjs imports AND proof generation completes
  ```

## How It Runs

1. **Background startup** (`src/background/index.ts`):
   - Check if spike has already run (cached in `chrome.storage.local`)
   - If not, create an offscreen document (`offscreen.html`)

2. **Offscreen document** (`src/offscreen/index.ts`):
   - Imports and runs `runCspSpike()`
   - Sends result back to background via `chrome.runtime.sendMessage`
   - Background caches it and closes the offscreen document

3. **On-demand queries**:
   - UI or popup requests `zk.capability` via the message router
   - Background returns the cached result
   - Result is displayed in the UI (e.g., "ZK proofs: ✓ viable" or "⚠ proof generation unavailable, server-side proving required")

## Interpretation

| Result | Meaning | Phase 1B Action |
|--------|---------|-----------------|
| `zkViableInMv3: true` | WASM compiles, snarkjs imports, proofs work | Ship ZK in Phase 1; proofs run in-extension |
| `zkViableInMv3: false` (CSP issue) | WASM or snarkjs blocked by CSP | Defer ZK to Phase 5; document the blocker |
| `zkViableInMv3: false` (artifacts missing) | Spike could not run because circuits not vendored | Re-run after Phase 5 ships circuits; treat as unknown for now |
| `zkViableInMv3: false` (proof timeout) | Proof generation took too long or failed | Investigate snarkjs version / circuit complexity; may defer to Phase 5 |

## Circuit Artifacts

The spike looks for:
- `public/circuits/transfer.wasm` (compiled circuit)
- `public/circuits/transfer.zkey` (proving key)

These are generated from a circom source and are not vendored yet. The spike gracefully reports `artifactsMissing: true` if they're absent, which is not a failure — it means "we could not test this tier of the stack."

## Next Steps

1. **Immediate**: Wire the spike into the background startup (update `src/background/index.ts`).
2. **Phase 1B**: Chain services assume ZK is either viable or deferred; they don't care which.
3. **Phase 4**: If viable, integrate proofs into the privacy layer.
4. **Phase 5**: If not viable, design server-side proving and update the UI.

## References

- SLIP-0010: https://github.com/satoshilabs/slips/blob/master/slip-0010.md
- snarkjs: https://github.com/iden3/snarkjs
- MV3 CSP: https://developer.chrome.com/docs/extensions/mv3/manifest/content_security_policy/
