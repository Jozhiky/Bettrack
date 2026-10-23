export const phases = [
  'preprocessing',
  'ocr',
  'reconstruction',
  'interpretation',
  'validation',
  'registration',
] as const;
type Phase = (typeof phases)[number];
export function createTiming(now = () => performance.now()) {
  const samples: { phase: Phase; inclusiveMs: number; exclusiveMs: number }[] = [];
  const stack: { phase: Phase; start: number; child: number }[] = [];
  const begin = (phase: Phase) => {
    const frame = { phase, start: now(), child: 0 };
    stack.push(frame);
    return frame;
  };
  const end = (frame: (typeof stack)[number]) => {
    if (stack.pop() !== frame) throw new Error('Timing requires serial execution');
    const inclusiveMs = now() - frame.start;
    samples.push({
      phase: frame.phase,
      inclusiveMs,
      exclusiveMs: Math.max(0, inclusiveMs - frame.child),
    });
    const parent = stack.at(-1);
    if (parent) parent.child += inclusiveMs;
  };
  return {
    samples,
    sync<T>(phase: Phase, action: () => T): T {
      const f = begin(phase);
      try {
        return action();
      } finally {
        end(f);
      }
    },
    async async<T>(phase: Phase, action: () => Promise<T>): Promise<T> {
      const f = begin(phase);
      try {
        return await action();
      } finally {
        end(f);
      }
    },
    reset() {
      if (stack.length) throw new Error('Cannot reset active timer');
      samples.length = 0;
    },
    summary() {
      return Object.fromEntries(
        phases.map((phase) => [
          phase,
          {
            calls: samples.filter((s) => s.phase === phase).length,
            ms: samples.filter((s) => s.phase === phase).reduce((sum, s) => sum + s.exclusiveMs, 0),
          },
        ]),
      );
    },
  };
}
