window.info.on(({text,background})=>{document.body.classList.toggle('no-background',!background);const element=document.getElementById('text');if(element.textContent!==text){element.textContent=text;element.scrollTop=0;}});
document.getElementById('close').onclick=()=>window.info.close().catch(e=>{document.getElementById('text').textContent=e.message;});
