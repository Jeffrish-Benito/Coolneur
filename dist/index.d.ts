export type CooldownMode = 'classic' | 'charges';
export interface ClassicConfig { mode?: 'classic'; durationMs?: number; cooldownMs?: number; cooldown?: number; metadata?: unknown }
export interface ChargesConfig { mode?: 'charges'; maxCharges: number; rechargeMs: number; initialCharges?: number; sharedGroup?: string; metadata?: unknown }
export type CooldownConfig = ClassicConfig | ChargesConfig;
export interface TryUseResult { success: boolean; remainingMs: number; mode: CooldownMode; charges?: number }
export interface CoolneurOptions { clock?: () => number }
export interface RestoreOptions { elapsedMs?: number; applyElapsed?: boolean }
export declare class Coolneur {
  constructor(options?: CoolneurOptions);
  stream(name: string): CoolneurStream;
  on(event: string, listener: (payload: any) => void): () => void;
  off(event: string, listener: (payload: any) => void): void;
  snapshot(): { version: 1; savedAt: number; streams: any[] };
  restore(data: any, options?: RestoreOptions): this;
  clear(): void;
}
export declare class CoolneurStream {
  readonly name: string;
  define(name: string, config?: CooldownConfig): this;
  has(name: string): boolean;
  start(name: string, durationMs?: number): this;
  use(name: string): this;
  tryUse(name: string): TryUseResult;
  remaining(name: string): number;
  isReady(name: string): boolean;
  charges(name: string): number;
  timeUntilNextCharge(name: string): number;
  timeUntilFull(name: string): number;
  pause(name: string): this;
  resume(name: string): this;
  reset(name: string, options?: { charges?: number }): this;
  delete(name: string): boolean;
  list(): string[];
  snapshot(): any;
  restore(data: any, options?: RestoreOptions): this;
}
export default Coolneur;
