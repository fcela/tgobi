import type { MissingMask } from "@/lib/data/types";

export class BitMissingMask implements MissingMask {
  readonly buffer: Uint8Array;
  readonly length: number;

  constructor(length: number, buffer?: Uint8Array) {
    if (length < 0 || !Number.isInteger(length)) {
      throw new RangeError(`length must be a non-negative integer (got ${length})`);
    }
    this.length = length;
    const needed = Math.ceil(length / 8);
    if (buffer) {
      if (buffer.length !== needed) {
        throw new RangeError(`buffer length ${buffer.length} != needed ${needed}`);
      }
      this.buffer = buffer;
    } else {
      this.buffer = new Uint8Array(needed);
    }
  }

  isMissing(i: number): boolean {
    this.#check(i);
    return (this.buffer[i >> 3]! & (1 << (i & 7))) !== 0;
  }

  setMissing(i: number, missing: boolean): void {
    this.#check(i);
    const byte = i >> 3;
    const bit = 1 << (i & 7);
    if (missing) this.buffer[byte] = this.buffer[byte]! | bit;
    else this.buffer[byte] = this.buffer[byte]! & ~bit;
  }

  count(): number {
    let n = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      let b = this.buffer[i]!;
      b = b - ((b >> 1) & 0x55);
      b = (b & 0x33) + ((b >> 2) & 0x33);
      n += (b + (b >> 4)) & 0x0f;
    }
    return n;
  }

  #check(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= this.length) {
      throw new RangeError(`row ${i} out of [0, ${this.length})`);
    }
  }
}
