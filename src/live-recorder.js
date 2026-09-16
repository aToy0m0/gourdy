class LiveRecorder {
  async start(stream, onAudio) {
    this.context = new AudioContext({ sampleRate: 16000 });
    if (this.context.sampleRate !== 16000) throw new Error('16kHzの録音を開始できません。');
    await this.context.audioWorklet.addModule('pcm-worklet.js');
    this.node = new AudioWorkletNode(this.context, 'pcm-capture');
    this.source = this.context.createMediaStreamSource(stream);
    this.source.connect(this.node); this.node.connect(this.context.destination);
    this.node.port.onmessage = event => {
      if (event.data.flushed) { this.flushResolve?.(); return; }
      onAudio(event.data);
    };
    await this.context.resume();
  }
  async stop() {
    this.source.disconnect();
    try { await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('録音の終了処理が応答しません。')), 3000);
      this.flushResolve = () => { clearTimeout(timeout); resolve(); };
      this.node.port.postMessage('flush');
    }); } finally {
      this.node.disconnect(); this.node.port.onmessage = null;
      await this.context.close();
    }
  }
}
