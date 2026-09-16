using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
class CommandAction { public string key {get;set;} public string text {get;set;} public int count {get;set;} }
class CommandRequest { public LiveState state {get;set;} public CommandAction[] actions {get;set;} }
static class CommandWriter {
 [DllImport("user32.dll",SetLastError=true)]static extern uint SendInput(uint count,INPUT[] inputs,int size);
 [StructLayout(LayoutKind.Sequential)]struct INPUT {public uint type;public UNION data;}
 [StructLayout(LayoutKind.Explicit,Size=32)]struct UNION {[FieldOffset(0)]public KEYBOARD keyboard;}
 [StructLayout(LayoutKind.Sequential)]struct KEYBOARD {public ushort key,scan;public uint flags,time;public UIntPtr extra;}
 static readonly HashSet<string> allowed=new HashSet<string>("Text|Left|Right|Up|Down|Home|End|Ctrl+Left|Ctrl+Right|Ctrl+Home|Ctrl+End|Shift+Left|Shift+Right|Shift+Up|Shift+Down|Shift+Home|Shift+End|Ctrl+Shift+Left|Ctrl+Shift+Right|Ctrl+Shift+Home|Ctrl+Shift+End|Backspace|Delete|Ctrl+Backspace|Ctrl+Delete|Ctrl+A|Ctrl+C|Ctrl+V|Ctrl+Z|Ctrl+Y|Enter|Shift+Enter|Tab|Shift+Tab|Escape".Split('|'));
 static readonly Dictionary<string,ushort> keys=new Dictionary<string,ushort>{{"Left",37},{"Right",39},{"Up",38},{"Down",40},{"Home",36},{"End",35},{"Backspace",8},{"Delete",46},{"Enter",13},{"Tab",9},{"Escape",27},{"A",65},{"C",67},{"V",86},{"Z",90},{"Y",89}};
 static INPUT Input(ushort key,ushort scan,uint flags){return new INPUT{type=1,data=new UNION{keyboard=new KEYBOARD{key=key,scan=scan,flags=flags}}};}
 static void Send(List<INPUT> batch){if(SendInput((uint)batch.Count,batch.ToArray(),Marshal.SizeOf(typeof(INPUT)))!=batch.Count)throw new Exception("Windowsがキー操作を拒否しました。入力先を確認してください。");}
 static void Press(string chord){var batch=new List<INPUT>();bool ctrl=chord.Contains("Ctrl+"),shift=chord.Contains("Shift+");if(ctrl)batch.Add(Input(17,0,0));if(shift)batch.Add(Input(16,0,0));var name=chord.Substring(chord.LastIndexOf('+')+1);ushort vk=keys[name];uint ext=vk>=33&&vk<=46?1u:0u;batch.Add(Input(vk,0,ext));batch.Add(Input(vk,0,ext|2));if(shift)batch.Add(Input(16,0,2));if(ctrl)batch.Add(Input(17,0,2));Send(batch);}
 static void Insert(string text){var batch=new List<INPUT>();foreach(char c in text){batch.Add(Input(0,c,4));batch.Add(Input(0,c,6));}Send(batch);}
 public static LiveState Run(IntPtr window,uint pid,CommandRequest request){
  if(request==null||request.state==null||request.actions==null||request.actions.Length<1||request.actions.Length>16)throw new Exception("操作計画が不正です。");
  int strokes=0,characters=0;
  // Validate every action before performing the first one.
  foreach(var a in request.actions){if(a==null||!allowed.Contains(a.key??"")||a.text==null||a.text.Length>256||a.count<1||a.count>100||a.key=="Text"&&(a.text.Length==0||a.count!=1)||a.key!="Text"&&a.text!="")throw new Exception("操作計画が不正です。");for(int i=0;i<a.text.Length;i++){char c=a.text[i];if(Char.IsControl(c))throw new Exception("文字入力に制御文字は指定できません。");if(Char.IsHighSurrogate(c)){if(i+1>=a.text.Length||!Char.IsLowSurrogate(a.text[++i]))throw new Exception("Unicode文字が不正です。");}else if(Char.IsLowSurrogate(c))throw new Exception("Unicode文字が不正です。");}strokes+=a.count;characters+=a.text.Length;}
  if(strokes>200||characters>1024)throw new Exception("操作の回数が多すぎます。");
  LiveWriter.WaitReleased();var state=request.state;int completed=0;
  try{foreach(var action in request.actions)for(int n=0;n<action.count;n++){
    LiveWriter.Verify(window,pid,state,true);var previous=state;
    if(action.key=="Text")Insert(action.text);else Press(action.key);
    completed++;Thread.Sleep(60);state=LiveWriter.Read(window,pid,false,true);
    if(state.editor!=previous.editor&&action.key!="Tab"&&action.key!="Shift+Tab")throw new Exception("入力欄が変わりました。");
    if(action.key=="Text"){
      var expected=new LiveState{editor=previous.editor,before=previous.before+action.text,after=previous.after,selected="",written=""};
      for(int i=0;i<30&&(state.before!=expected.before||state.after!=expected.after||state.selected!="");i++){Thread.Sleep(10);state=LiveWriter.Read(window,pid,false,true);}
      LiveWriter.Verify(window,pid,expected,true);
    }else if(action.key.Contains("Left")||action.key.Contains("Right")||action.key.Contains("Up")||action.key.Contains("Down")||action.key.Contains("Home")||action.key.Contains("End")||action.key=="Ctrl+A"||action.key=="Ctrl+C"){
      if(previous.before+(previous.selected??"")+previous.after!=state.before+(state.selected??"")+state.after)throw new Exception("カーソル操作中に文章が変わりました。");
    }
  }return state;}catch(Exception e){throw new Exception(e.Message+" 操作を停止しました（送信済み "+completed+" 回）。入力先を確認してください。");}
 }
}
