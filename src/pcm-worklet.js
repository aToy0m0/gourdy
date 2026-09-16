class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = new Float32Array(sampleRate / 10); this.length = 0;
    this.port.onmessage = event => { if (event.data === 'flush') { this.flush(); this.port.postMessage({ flushed: true }); } };
  }
  flush() {
    if (!this.length) return;
    const data = this.length === this.buffer.length ? this.buffer : this.buffer.slice(0, this.length);
    this.port.postMessage(data, [data.buffer]);
    this.buffer = new Float32Array(sampleRate / 10); this.length = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) {
      for (let i = 0; i < channels[0].length; i++) {
        let value = 0;
        for (const channel of channels) value += channel[i] / channels.length;
        this.buffer[this.length++] = value;
        if (this.length === this.buffer.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
