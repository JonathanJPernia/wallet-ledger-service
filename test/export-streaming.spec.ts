import { Readable } from 'stream';
import { readableFromCsvGenerator } from '../src/common/streaming/csv-stream.util';

async function collectStream(stream: Readable): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
  }
  return chunks.join('');
}

describe('export streaming', () => {
  it('streams CSV without building one giant string in the generator', async () => {
    async function* gen() {
      yield 'a\n';
      yield 'b\n';
      yield 'c\n';
    }

    const stream = readableFromCsvGenerator(gen());
    const out = await collectStream(stream);
    expect(out).toBe('a\nb\nc\n');
  });

  it('handles large row count with bounded generator state', async () => {
    const rowCount = 12_000;

    async function* gen() {
      yield 'header\n';
      for (let i = 0; i < rowCount; i++) {
        yield `${i}\n`;
      }
    }

    const stream = readableFromCsvGenerator(gen());
    let lines = 0;
    for await (const chunk of stream) {
      const s = typeof chunk === 'string' ? chunk : chunk.toString();
      lines += s.split('\n').filter((l) => l.length > 0).length;
    }
    expect(lines).toBe(rowCount + 1);
  });
});
