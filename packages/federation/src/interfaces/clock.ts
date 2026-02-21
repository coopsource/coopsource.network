export interface IClock {
  now(): Date;
  nowIso(): string;
  nowMs(): number;
}
