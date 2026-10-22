import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOcrSession } from '../ocr/session';

afterEach(() => vi.useRealTimers());
const setup = () => {
  const factory = vi.fn(async () => ({
    recognize: vi.fn(),
    terminate: vi.fn(async () => ({ jobId: 'test', data: null })),
  }));
  return { factory, session: createOcrSession(factory, 1000) };
};
describe('OCR session lifecycle', () => {
  it('terminates a stuck read and allows subsequent files to continue', async () => {
    vi.useFakeTimers();
    const reader = {
      recognize: vi.fn(),
      terminate: vi.fn(async () => ({ jobId: 'test', data: null })),
    };
    const factory = vi.fn(async () => reader);
    const session = createOcrSession(factory, 1000, 50);
    const stalled = session.run(async () => new Promise(() => {}));
    const rejected = expect(stalled).rejects.toThrow('superó');
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(reader.terminate).toHaveBeenCalledOnce();
    expect(await session.run(async () => 42)).toBe(42);
    expect(factory).toHaveBeenCalledTimes(2);
    session.dispose();
  });
  it('discards a worker that initializes after its deadline', async () => {
    vi.useFakeTimers();
    const late = {
      recognize: vi.fn(),
      terminate: vi.fn(async () => ({ jobId: 'test', data: null })),
    };
    let complete!: (value: typeof late) => void;
    const factory = vi.fn(
      () =>
        new Promise<typeof late>((resolve) => {
          complete = resolve;
        }),
    );
    const session = createOcrSession(factory, 1000, 50),
      task = vi.fn();
    const rejected = expect(session.run(task)).rejects.toThrow('superó');
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    complete(late);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.terminate).toHaveBeenCalledOnce();
    expect(task).not.toHaveBeenCalled();
    session.dispose();
  });
  it('reuses the loaded worker between uploads and releases it after inactivity', async () => {
    vi.useFakeTimers();
    const { factory, session } = setup();
    const first = await session.run(async (reader) => reader);
    await vi.advanceTimersByTimeAsync(800);
    expect(await session.run(async (reader) => reader)).toBe(first);
    await vi.advanceTimersByTimeAsync(800);
    expect(first.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(await session.run(async (reader) => reader)).not.toBe(first);
    expect(factory).toHaveBeenCalledTimes(2);
    session.dispose();
  });
  it('serializes reads so simultaneous uploads do not share a busy worker', async () => {
    const { session } = setup();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const order: number[] = [];
    const a = session.run(async () => {
      order.push(1);
      await gate;
      order.push(2);
    });
    const b = session.run(async () => {
      order.push(3);
    });
    await vi.waitFor(() => expect(order).toEqual([1]));
    finish();
    await Promise.all([a, b]);
    expect(order).toEqual([1, 2, 3]);
    session.dispose();
  });
  it('recreates a failed reader and lets the next upload continue', async () => {
    const { factory, session } = setup();
    const first = await session.run(async (reader) => reader);
    await expect(
      session.run(async () => {
        throw new Error('OCR failed');
      }),
    ).rejects.toThrow('OCR failed');
    expect(first.terminate).toHaveBeenCalledOnce();
    await session.run(async () => 1);
    expect(factory).toHaveBeenCalledTimes(2);
    session.dispose();
  });
  it('disposes a worker that is still initializing and does not read after logout', async () => {
    const reader = {
      recognize: vi.fn(),
      terminate: vi.fn(async () => ({ jobId: 'test', data: null })),
    };
    let finish!: (value: typeof reader) => void;
    const factory = vi.fn(
      () =>
        new Promise<typeof reader>((resolve) => {
          finish = resolve;
        }),
    );
    const session = createOcrSession(factory);
    const task = vi.fn();
    const pending = session.run(task);
    const rejected = expect(pending).rejects.toThrow('cerró');
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    session.dispose();
    finish(reader);
    await rejected;
    expect(task).not.toHaveBeenCalled();
    expect(reader.terminate).toHaveBeenCalledOnce();
    await expect(session.run(task)).rejects.toThrow('cerró');
  });
});
