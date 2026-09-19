(() => {
 const popup=document.createElement('div');
 popup.id='settings-help-popup';popup.role='tooltip';popup.hidden=true;document.body.append(popup);
 let active=null,timer;
 const close=()=>{clearTimeout(timer);active?.removeAttribute('aria-describedby');active=null;popup.hidden=true;};
 const later=()=>{clearTimeout(timer);timer=setTimeout(close,160);};
 const show=(button,notes)=>{
  clearTimeout(timer);active?.removeAttribute('aria-describedby');active=button;
  popup.textContent=notes.map(note=>note.innerText||note.textContent).join('\n\n');
  popup.hidden=false;button.setAttribute('aria-describedby',popup.id);
  const r=button.getBoundingClientRect(),w=popup.offsetWidth,h=popup.offsetHeight;
  popup.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';
  popup.style.top=Math.max(8,r.bottom+8+h<=innerHeight?r.bottom+8:r.top-h-8)+'px';
 };
 const candidates=[...document.querySelectorAll('section small:not([id]),#correction-model-info,#ai p[data-help]')]
  .filter(note=>note.textContent.trim()&&!/^(gpt-live-transcribe|gemini-3\.5-transcribe)/.test(note.textContent.trim()));
 const groups=new Map();
 for(const note of candidates){
  let anchor=note.dataset.helpFor?document.getElementById(note.dataset.helpFor):note.previousElementSibling;
  while(anchor&&candidates.includes(anchor))anchor=anchor.previousElementSibling;
  if(!anchor){anchor=note.parentElement.querySelector('summary,p,.dictionary-actions');}
  if(!anchor||anchor===note||anchor.tagName==='TABLE'||anchor.tagName==='SELECT'||anchor.tagName==='AUDIO'){
   anchor=document.createElement('span');anchor.className='help-standalone';note.before(anchor);
  }
  if(!groups.has(anchor))groups.set(anchor,[]);
  groups.get(anchor).push(note);note.classList.add('help-source');
 }
 for(const [anchor,notes] of groups){
  const button=document.createElement('button');button.type='button';button.className='help-button';button.setAttribute('aria-label','補足説明');
  button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
  if(anchor.tagName==='LABEL'){
   const caption=document.createElement('span');caption.className='help-caption';
   const textNodes=[...anchor.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE);
   if(textNodes.length)textNodes[0].before(caption);else anchor.prepend(caption);
   for(const node of textNodes)caption.append(node);
   caption.append(button);
  }else if(anchor.tagName==='BUTTON'||anchor.tagName==='INPUT'){anchor.after(button);}
  else anchor.append(button);
  button.addEventListener('mouseenter',()=>show(button,notes));
  button.addEventListener('mouseleave',later);
  button.addEventListener('focus',()=>show(button,notes));
  button.addEventListener('blur',later);
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();show(button,notes);});
 }
 popup.addEventListener('mouseenter',()=>clearTimeout(timer));popup.addEventListener('mouseleave',later);
 document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
 document.addEventListener('scroll',event=>{if(!popup.contains(event.target))close();},true);
 document.querySelector('nav').addEventListener('click',close);
 window.addEventListener('resize',close);
})();
