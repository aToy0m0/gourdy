const {spawn}=require('node:child_process');
const net=require('node:net'),path=require('node:path'),fs=require('node:fs/promises');
const {randomBytes}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
async function withLocalLlm(settings,signal,run){
  for(const key of ['llmEngine','llmModel'])if(!path.isAbsolute(settings[key]||'')||!(await fs.stat(settings[key])).isFile())throw new Error(`${key}を確認してください。`);
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
  const key = randomBytes(32).toString('hex');
  const child = spawn(settings.llmEngine, ['-m', settings.llmModel, '--host', '127.0.0.1', '--port', String(port),
    '--api-key', key, '-c', '4096', '-b', '64', '-ub', '32', '--parallel', '1',
    '-ngl', '0', '--no-repack', '--jinja', '--reasoning-budget', String(settings.reasoningBudget||0), '--no-webui'],
  { windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
  let failure, closed = false, stderr = '';
  child.on('error', error => { failure = error; });
  child.stderr.setEncoding('utf8'); child.stderr.on('data', text => { stderr = (stderr + text).slice(-2000); });
  const exited = new Promise(resolve => child.once('close', code => { closed = true; if (!failure) failure = new Error(`LLMが終了しました（${code}）。\n${stderr}`); resolve(); }));
  const abort = () => { child.kill(); }; signal?.addEventListener('abort', abort, { once: true });
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const base = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 90000;
    while (true) {
      signal?.throwIfAborted(); if (failure) throw failure;
      if (Date.now() > deadline) throw new Error('LLMの起動が90秒以内に完了しませんでした。');
      try {
        const response = await fetch(`${base}/health`, { headers, redirect: 'error', signal: AbortSignal.timeout(1000) });
        if (response.ok) break;
        if (response.status !== 503) throw new Error(`LLMの状態確認に失敗しました: ${response.status}`);
      } catch (error) {
        if (error.name !== 'TimeoutError' && error.cause?.code !== 'ECONNREFUSED') throw error;
      }
      await delay(250, undefined, { signal });
    }
    return await run(async ({messages,schema,maxTokens=1400,timeout=180000})=>{
      signal?.throwIfAborted();if(failure)throw failure;
      const response=await fetch(`${base}/v1/chat/completions`,{method:'POST',headers,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(timeout)].filter(Boolean)),body:JSON.stringify({messages,temperature:0,max_tokens:maxTokens,stream:false,response_format:{type:'json_schema',json_schema:{name:'result',strict:true,schema}},chat_template_kwargs:{enable_thinking:Boolean(settings.reasoningBudget)}})});
      if(!response.ok)throw new Error(`LLMに失敗しました（HTTP ${response.status}）。`);
      const body=await response.json();if(body.choices?.[0]?.finish_reason!=='stop')throw new Error('LLMの応答が途中で切れました。短い指示で再実行してください。');
      return JSON.parse(body.choices[0].message.content);
    });
  } finally {
    signal?.removeEventListener('abort', abort);
    if (!closed) child.kill();
    await exited;
  }
}
module.exports={withLocalLlm};
