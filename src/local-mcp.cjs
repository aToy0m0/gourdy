const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),{randomBytes,timingSafeEqual}=require('node:crypto');
const {Server}=require('@modelcontextprotocol/sdk/server/index.js');
const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {ListToolsRequestSchema,CallToolRequestSchema}=require('@modelcontextprotocol/sdk/types.js');
const tools=[
 ['prepare_file','ローカル音声・動画を検査して文字起こしジョブを保存します。まだ認識は開始しません。',{path:{type:'string',description:'音声・動画の絶対パス'}},['path']],
 ['start_transcription','保存したジョブの未完了区間を開始・再開します。すぐにIDを返すのでget_transcriptionで進捗を確認してください。',{id:{type:'string'}},['id']],
 ['get_transcription','進捗、区間ごとの失敗、保存済みの文字起こし結果を取得します。',{id:{type:'string'}},['id']],
 ['list_transcriptions','保存したファイル文字起こしジョブの一覧を取得します。',{},[]],
 ['cancel_transcription','指定した実行中ジョブを中断します。保存済み区間は再開できます。',{id:{type:'string'}},['id']]
].map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}}));
class LocalMcp {
 constructor(folder,handlers,version,onError=()=>{}){Object.assign(this,{folder,handlers,version,onError});this.status={state:'disabled'};this.server=null;this.token=null;}
 async loadToken(){if(this.token)return;const file=path.join(this.folder,'mcp-token');try{this.token=(await fs.readFile(file,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;this.token=randomBytes(32).toString('hex');await fs.writeFile(file,this.token,{flag:'wx',mode:0o600});}if(!/^[a-f0-9]{64}$/.test(this.token))throw new Error('MCP認証トークンが不正です。');}
 async configure(settings){
  if(!settings.mcpEnabled){await this.close();this.status={state:'disabled'};return;}
  if(this.server&&this.status.port===settings.mcpPort)return;
  await this.loadToken();const port=settings.mcpPort,server=http.createServer((req,res)=>this.handle(req,res,port).catch(e=>{if(!res.headersSent)res.writeHead(500);res.end();this.onError(e)}));
  server.requestTimeout=45000;server.headersTimeout=10000;
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve()})});}
  catch(e){throw new Error(`MCPポート ${port} を開始できません: ${e.code||e.message}`);}
  await this.close();this.server=server;this.status={state:'listening',port,url:`http://127.0.0.1:${port}/mcp`};server.on('error',e=>{this.status={state:'error',error:e.message};this.onError(e)});
 }
 async close(){const server=this.server;this.server=null;if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}this.status={state:'disabled'};}
 configuration(){if(this.status.state!=='listening')throw new Error('MCP接続が有効になっていません。');return {mcpServers:{gourdy:{url:this.status.url,headers:{Authorization:'Bearer '+this.token}}}};}
 async handle(req,res,port){
  const reject=(code,message)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify({error:message}));};
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return reject(403,'Local origin required');
  const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+this.token);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return reject(401,'Bearer token required');
  if(req.url!=='/mcp')return reject(404,'Not found');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reject(405,'Use POST');}
  if(!req.headers['content-type']?.startsWith('application/json'))return reject(415,'Use application/json');
  let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>65536)return reject(413,'Request too large');chunks.push(chunk);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reject(400,'Invalid JSON');}
  const server=new Server({name:'Gourdy',version:this.version},{capabilities:{tools:{}}});
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
  server.setRequestHandler(CallToolRequestSchema,async request=>{
   const name=request.params.name,args=request.params.arguments||{},tool=tools.find(t=>t.name===name);
   try{if(!tool||!args||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(tool.inputSchema.properties,k))||tool.inputSchema.required.some(k=>typeof args[k]!=='string'||!args[k]||args[k].length>4096))throw new Error('ツール名または引数が不正です。');
    const value=await this.handlers[name](args);return {content:[{type:'text',text:JSON.stringify(value)}]};
   }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
  });
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{server.close().catch(this.onError)});await server.connect(transport);await transport.handleRequest(req,res,body);
 }
}
async function localMediaPath(file){if(typeof file!=='string'||!path.isAbsolute(file)||file.startsWith('\\\\')||!['.wav','.mp3','.m4a','.mp4','.webm','.mkv','.mov','.flac','.ogg','.aac','.wma','.wmv'].includes(path.extname(file).toLowerCase()))throw new Error('対応するローカル音声・動画の絶対パスを指定してください。');const resolved=await fs.realpath(file);if(resolved.startsWith('\\\\'))throw new Error('ネットワーク上のファイルは指定できません。');if(!(await fs.stat(resolved)).isFile())throw new Error('通常の音声・動画ファイルを指定してください。');return resolved;}
module.exports={LocalMcp,localMediaPath};
