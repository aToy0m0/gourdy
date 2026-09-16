const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('100msのPCM境界と停止時の端数で音声を欠落・重複させない', () => {
  let Processor;
  const messages = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/pcm-worklet.js'), 'utf8'), {
    sampleRate: 16000, Float32Array,
    AudioWorkletProcessor: class { port = { postMessage: value => messages.push(structuredClone(value, { transfer: value.buffer ? [value.buffer] : [] })) }; },
    registerProcessor: (_, value) => { Processor = value; }
  });
  const worker = new Processor(), expected = [];
  for (let offset = 0; offset < 4096; offset += 128) {
    const left = Float32Array.from({ length: 128 }, (_, i) => (offset + i) / 8192);
    const right = new Float32Array(128);
    expected.push(...left.map(value => value / 2));
    worker.process([[left, right]]);
  }
  worker.port.onmessage({ data: 'flush' });
  assert.deepEqual(messages.slice(0, -1).map(value => value.length), [1600, 1600, 896]);
  assert.deepEqual(messages.slice(0, -1).flatMap(value => [...value]), expected);
  assert.equal(messages.at(-1).flushed, true);
});
