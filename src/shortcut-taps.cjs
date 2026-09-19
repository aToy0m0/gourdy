class ShortcutTaps {
  constructor(single,double){this.single=single;this.double=double;this.timer=null;}
  tap(){
    if(this.timer!==null){this.cancel();this.double();return;}
    this.timer=setTimeout(()=>{this.timer=null;this.single();},400);
  }
  cancel(){if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
}
function shouldHideMini({pinned,phase,info,bubble,editor}){
  return !pinned&&phase==='idle'&&!info&&!bubble&&!editor;
}
module.exports={ShortcutTaps,shouldHideMini};
