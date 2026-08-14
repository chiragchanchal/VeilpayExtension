/**
 * snarkjs ships no type declarations. Only the surface the D3 spike touches is
 * declared here; widen it when real proving lands in Phase 3.
 */
declare module 'snarkjs' {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: unknown; publicSignals: unknown }>;
    verify(
      verificationKey: unknown,
      publicSignals: unknown,
      proof: unknown,
    ): Promise<boolean>;
  };
}
