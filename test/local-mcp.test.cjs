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
