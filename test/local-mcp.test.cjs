const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {LocalMcp,localMediaPath}=require('../src/local-mcp.cjs');const {Client}=require('@modelcontextprotocol/sdk/client/index.js');const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
test('MCP authenticates, rejects remote origins, exposes jobs and disables cleanly',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'gourdy-mcp-')),reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const calls=[],server=new LocalMcp(folder,{list_transcriptions:async()=>[],start_transcription:async args=>{calls.push(args);return {id:args.id,state:'running'}},get_transcription:async()=>{throw new Error('job missing')}},'0.6.0'),client=new Client({name:'test',version:'1'});
 try{await server.configure({mcpEnabled:true,mcpPort:port});const url=server.status.url,headers=server.configuration().mcpServers.gourdy.headers;
 assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://example.com','Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal(await new Promise((resolve,reject)=>{const req=require('node:http').request(url,{method:'POST',headers:{...headers,Host:'evil.example','Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end('{}')}),403);
 const transport=new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers}});await client.connect(transport);assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['prepare_file','start_transcription','get_transcription','list_transcriptions','cancel_transcription']);
 const start=await client.callTool({name:'start_transcription',arguments:{id:'job-1'}});assert.equal(JSON.parse(start.content[0].text).state,'running');assert.deepEqual(calls,[{id:'job-1'}]);
 assert.equal((await client.callTool({name:'get_transcription',arguments:{id:'missing'}})).isError,true);
 assert.equal((await client.callTool({name:'start_transcription',arguments:{id:2}})).isError,true);
 const second=new LocalMcp(folder,{},'0.6.0');await assert.rejects(second.configure({mcpEnabled:true,mcpPort:port}),/MCPポート/);
 await client.close();await server.configure({mcpEnabled:false});assert.equal(server.status.state,'disabled');await assert.rejects(fetch(url));
 }finally{await client.close();await server.close();await fs.rm(folder,{recursive:true,force:true});}
});
test('MCP rejects non-media, relative paths and network shares',async()=>{for(const file of ['https://example.com/a.mp3','relative.wav','C:\\test.txt','\\\\server\\audio.wav'])await assert.rejects(localMediaPath(file));});

test('MCP 2026-07-28 supports direct requests, job handles and strict header validation',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'gourdy-modern-mcp-'));
 const jobs=new Map(),errors=[];
 const server=new LocalMcp(folder,{
  prepare_file:async({path:file})=>{const job={id:'job-1',source:file,state:'ready'};jobs.set(job.id,job);return job;},
  start_transcription:async({id})=>{const job=jobs.get(id);job.state='running';return job;},
  get_transcription:async({id})=>jobs.get(id),
  list_transcriptions:async()=>[...jobs.values()],
  cancel_transcription:async({id})=>{const job=jobs.get(id);job.state='paused';return job;}
 },'0.7.1',error=>errors.push(error));
 t.after(async()=>{await server.close();await fs.rm(folder,{recursive:true,force:true});});
 const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 await server.configure({mcpEnabled:true,mcpPort:port});
 const post=async(method,params={},headerOverrides={},revision='2026-07-28')=>{
  const meta={'io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/protocolVersion':revision,'io.modelcontextprotocol/clientInfo':{name:'wire-test',version:'1'}};
  const response=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{
   Authorization:'Bearer '+server.token,'Content-Type':'application/json',Accept:'application/json, text/event-stream',
   'MCP-Protocol-Version':revision,'Mcp-Method':method,...(params.name?{'Mcp-Name':params.name}:{}),...headerOverrides
  },body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:meta}})});
  return {response,body:await response.json()};
 };
 // No initialize or discover precedes this first request.
 const listing=await post('tools/list');
 assert.equal(listing.response.status,200,JSON.stringify(listing.body));assert.equal(listing.response.headers.get('mcp-session-id'),null);
 assert.match(listing.response.headers.get('content-type'),/application\/json/);
 assert.equal(listing.body.result.tools.length,5);
 const call=async(name,args)=>{const {response,body}=await post('tools/call',{name,arguments:args});assert.equal(response.status,200);assert.equal(body.result.resultType,'complete');return JSON.parse(body.result.content[0].text);};
 const prepared=await call('prepare_file',{path:'C:\\meeting.mp4'});
 assert.equal((await call('start_transcription',{id:prepared.id})).state,'running');
 assert.equal((await call('get_transcription',{id:prepared.id})).source,'C:\\meeting.mp4');
 assert.equal((await call('cancel_transcription',{id:prepared.id})).state,'paused');
 assert.equal((await call('list_transcriptions',{})).length,1);
 const mismatch=await post('tools/list',{}, {'Mcp-Method':'tools/call'});
 assert.equal(mismatch.response.status,400);assert.equal(mismatch.body.error.code,-32020);
 const unsupported=await post('tools/list',{}, {},'2099-01-01');
 assert.equal(unsupported.response.status,400);assert.equal(unsupported.body.error.code,-32022);
 assert.equal((await post('tools/list',{}, {Authorization:'Bearer invalid'})).response.status,401);
 assert.equal((await post('tools/list',{}, {Origin:'https://example.com'})).response.status,403);
 const discover=await post('server/discover');assert.equal(discover.response.status,200);
 const {Client:ModernClient,StreamableHTTPClientTransport:ModernTransport}=require('@modelcontextprotocol/client');
 const modern=new ModernClient({name:'modern-test',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 const methods=[];
 const transport=new ModernTransport(new URL(`http://127.0.0.1:${port}/mcp`),{
  requestInit:{headers:{Authorization:'Bearer '+server.token}},
  fetch:async(url,init)=>{if(init?.body)methods.push(JSON.parse(init.body).method);return fetch(url,init);}
 });
 try{
  await modern.connect(transport);assert.equal(modern.getProtocolEra(),'modern');
  assert.equal((await modern.listTools()).tools.length,5);
  assert.equal(JSON.parse((await modern.callTool({name:'get_transcription',arguments:{id:prepared.id}})).content[0].text).state,'paused');
  assert.ok(!methods.includes('initialize'));assert.ok(!methods.includes('notifications/initialized'));
 }finally{await modern.close();}
});
