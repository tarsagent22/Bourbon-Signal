import { isDeepStrictEqual } from 'node:util';

export function compressUnchangedHistory(history = []) {
  const output = [];
  for (const entry of history) {
    const previous = output[output.length - 1];
    if (previous && isDeepStrictEqual(previous.value, entry.value)) {
      if (previous.kind === 'unchanged_interval') {
        previous.observedAt.push(entry.observedAt);
      } else {
        output[output.length - 1] = { kind: 'unchanged_interval', observedAt: [previous.observedAt, entry.observedAt], value: structuredClone(entry.value) };
      }
    } else {
      output.push({ observedAt: entry.observedAt, value: structuredClone(entry.value) });
    }
  }
  return output;
}

export function expandHistory(compressed = []) {
  return compressed.flatMap((entry) => entry.kind === 'unchanged_interval'
    ? entry.observedAt.map((observedAt) => ({ observedAt, value: structuredClone(entry.value) }))
    : [{ observedAt: entry.observedAt, value: structuredClone(entry.value) }]);
}
