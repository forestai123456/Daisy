export interface VadResult {
  speechStart: boolean;
  silenceEnd: boolean;
}

export class VAD {
  private energyThreshold: number;
  private speechStartMs: number;
  private silenceEndMs: number;
  private inSpeech = false;
  private aboveThresholdMs = 0;
  private belowThresholdMs = 0;

  constructor(options?: { threshold?: number; speechStartMs?: number; silenceEndMs?: number }) {
    this.energyThreshold = options?.threshold ?? 0.012;
    this.speechStartMs = options?.speechStartMs ?? 200;
    this.silenceEndMs = options?.silenceEndMs ?? 700;
  }

  feed(buffer: Buffer): VadResult {
    const energy = this.calculateEnergy(buffer);
    const chunkMs = (buffer.length / 2) / 16;
    const isLoud = energy > this.energyThreshold;

    if (!this.inSpeech) {
      if (isLoud) {
        this.aboveThresholdMs += chunkMs;
        this.belowThresholdMs = 0;
        if (this.aboveThresholdMs >= this.speechStartMs) {
          this.inSpeech = true;
          this.aboveThresholdMs = 0;
          return { speechStart: true, silenceEnd: false };
        }
      } else {
        this.aboveThresholdMs = 0;
      }
      return { speechStart: false, silenceEnd: false };
    } else {
      if (isLoud) {
        this.belowThresholdMs = 0;
      } else {
        this.belowThresholdMs += chunkMs;
        if (this.belowThresholdMs >= this.silenceEndMs) {
          this.inSpeech = false;
          this.belowThresholdMs = 0;
          this.aboveThresholdMs = 0;
          return { speechStart: false, silenceEnd: true };
        }
      }
      return { speechStart: false, silenceEnd: false };
    }
  }

  reset(): void {
    this.inSpeech = false;
    this.aboveThresholdMs = 0;
    this.belowThresholdMs = 0;
  }

  private calculateEnergy(buffer: Buffer): number {
    let sum = 0;
    const samples = buffer.length / 2;
    if (samples === 0) return 0;
    for (let i = 0; i < buffer.length; i += 2) {
      sum += Math.abs(buffer.readInt16LE(i));
    }
    return sum / samples / 32768;
  }
}
