import { Readable } from 'stream';

/**
 * Convierte un async generator de strings CSV en Readable sin acumular el export completo.
 * Memoria acotada por el tamaño del chunk actual + buffer interno de Node (~64KB default).
 */
export function readableFromCsvGenerator(
  generator: AsyncGenerator<string, void, unknown>,
): Readable {
  const iterator = generator[Symbol.asyncIterator]();
  let done = false;

  return new Readable({
    async read() {
      if (done) {
        this.push(null);
        return;
      }
      try {
        const { value, done: isDone } = await iterator.next();
        done = isDone === true;
        if (value !== undefined) {
          this.push(value);
        }
        if (isDone) {
          this.push(null);
        }
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
}
