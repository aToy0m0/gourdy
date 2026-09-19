const MODELS={openai:'gpt-5.6-luna',gemini:'gemini-3.5-flash'};
// Keys and network requests stay in the main process. Never include response bodies
// in exceptions: provider errors may echo a credential or user text.
function cloudRequest(provider,key,signal,fetcher=fetch){
 if(!MODELS[provider])throw new Error('APIの選択が不正です。');
 return async({messages,schema,maxTokens=1400,timeout=45000})=>{
  const clean=messages.map(m=>({...m,content:m.content.replaceAll(' /no_think','')}));
  const openai=provider==='openai';
  const url=openai?'https://api.openai.com/v1/responses':`https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent`;
  const body=openai?{model:MODELS.openai,store:false,reasoning:{effort:'none'},input:clean,max_output_tokens:maxTokens,text:{format:{type:'json_schema',name:'result',strict:true,schema}}}:{
   systemInstruction:{parts:[{text:clean.filter(m=>m.role==='system').map(m=>m.content).join('\n')}]},
   contents:clean.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),
   generationConfig:{maxOutputTokens:maxTokens,responseMimeType:'application/json',responseJsonSchema:schema,thinkingConfig:{thinkingLevel:'LOW'}}
  };
  let response;
  try{response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(openai?{Authorization:`Bearer ${key}`}:{'x-goog-api-key':key})},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(Math.min(timeout,45000))].filter(Boolean))});}
  catch(e){if(signal?.aborted)throw signal.reason;throw new Error(`${provider}の補正APIに接続できません（通信・タイムアウト）。原文は保持しています。`);}
  if(!response.ok)throw new Error(`${provider}の補正API: HTTP ${response.status}。キー・残高・利用上限を確認してください。`);
  let value,text;try{value=await response.json();}catch{throw new Error(`${provider}の補正APIが不正な応答を返しました。`);}
  if(openai){if(value.status!=='completed')throw new Error('OpenAIの補正が完了しませんでした。');text=(value.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');}
  else{const candidate=value.candidates?.[0];if(candidate?.finishReason!=='STOP')throw new Error('Geminiの補正が完了しませんでした。');text=(candidate.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('');}
  try{return JSON.parse(text);}catch{throw new Error(`${provider}の補正結果の形式が不正です。原文は保持しています。`);}
 };
}
module.exports={cloudRequest,MODELS};
