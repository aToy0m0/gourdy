using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;
using System.Web.Script.Serialization;

class StreamRequest {public string kind {get;set;} public string text {get;set;} public int[] shortcut {get;set;}}
// One lightweight process per recording. Hooks observe real user edits independently
// of the application's accessibility text/caret update cadence.
static class RealtimeInput {
  const uint Tag=0x6F6B6F73;
  delegate IntPtr Hook(int code,IntPtr message,IntPtr data);
  [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SetWindowsHookEx(int id,Hook callback,IntPtr module,uint thread);
  [DllImport("user32.dll")]static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")]static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
  [DllImport("kernel32.dll")]static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")]static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll",SetLastError=true)]static extern uint SendInput(uint count,INPUT[] inputs,int size);
  [StructLayout(LayoutKind.Sequential)]struct POINT {public int x,y;}
  [StructLayout(LayoutKind.Sequential)]struct MOUSE {public POINT point;public uint data,flags,time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Sequential)]struct KEYEVENT {public uint key,scan,flags,time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Sequential)]struct INPUT {public uint type;public UNION data;}
  [StructLayout(LayoutKind.Explicit,Size=32)]struct UNION {[FieldOffset(0)]public KEYBOARD keyboard;}
  [StructLayout(LayoutKind.Sequential)]struct KEYBOARD {public ushort key,scan;public uint flags,time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Sequential)]struct RECT {public int left,top,right,bottom;}
  [StructLayout(LayoutKind.Sequential)]struct GUIINFO {public uint size,flags;public IntPtr active,focus,capture,menu,move,caret;public RECT rect;}
  [DllImport("user32.dll")]static extern bool GetGUIThreadInfo(uint thread,ref GUIINFO info);
  [DllImport("imm32.dll")]static extern IntPtr ImmGetDefaultIMEWnd(IntPtr window);
  [DllImport("user32.dll")]static extern IntPtr SendMessageTimeout(IntPtr window,uint message,IntPtr wparam,IntPtr lparam,uint flags,uint timeout,out IntPtr result);
  static bool ImeOpen(IntPtr ime){IntPtr result;if(SendMessageTimeout(ime,0x283,new IntPtr(5),IntPtr.Zero,2,500,out result)==IntPtr.Zero)throw new Exception("日本語IMEの状態を確認できません。");return result!=IntPtr.Zero;}
  static void SetIme(IntPtr ime,bool open){IntPtr result;if(SendMessageTimeout(ime,0x283,new IntPtr(6),new IntPtr(open?1:0),2,500,out result)==IntPtr.Zero||ImeOpen(ime)!=open)throw new Exception("日本語IMEの入力状態を切り替えられません。");}
  static volatile bool active;
  static volatile string changed;
  static uint excluded;
  static int[] shortcut;
  static Hook keyboard=OnKey,mouse=OnMouse;
  static IntPtr keyHook,mouseHook;
  static bool Modifier(uint key){return key==16||key==17||key==18||key==91||key==92||key>=160&&key<=165;}
  static bool StopShortcut(uint key){
    if(shortcut==null||shortcut.Length<2||key!=shortcut[shortcut.Length-1])return false;
    for(int i=0;i<shortcut.Length-1;i++){int k=shortcut[i];if((GetAsyncKeyState(k)&0x8000)==0 && !(k==91&&(GetAsyncKeyState(92)&0x8000)!=0))return false;}
    return true;
  }
  static IntPtr OnKey(int code,IntPtr message,IntPtr data){
    if(code>=0&&active&&(message.ToInt32()==0x100||message.ToInt32()==0x104)){
      var e=(KEYEVENT)Marshal.PtrToStructure(data,typeof(KEYEVENT));
      if(e.extra.ToUInt64()!=Tag&&!Modifier(e.key)&&!StopShortcut(e.key))changed="キー操作を検出したため自動入力を停止しました。録音は続きます。";
    }
    return CallNextHookEx(keyHook,code,message,data);
  }
  static IntPtr OnMouse(int code,IntPtr message,IntPtr data){
    int m=message.ToInt32();
    if(code>=0&&active&&(m==0x201||m==0x204||m==0x207||m==0x20B)){
      var e=(MOUSE)Marshal.PtrToStructure(data,typeof(MOUSE));uint pid;GetWindowThreadProcessId(WindowFromPoint(e.point),out pid);
      if(pid!=excluded)changed="クリックを検出したため自動入力を停止しました。録音は続きます。";
    }
    return CallNextHookEx(mouseHook,code,message,data);
  }
  static string Id(AutomationElement e){return String.Join(",",Array.ConvertAll(e.GetRuntimeId(),x=>x.ToString()));}
  static string Value(AutomationElement e){object p;return e.TryGetCurrentPattern(ValuePattern.Pattern,out p)?((ValuePattern)p).Current.Value:null;}
  static AutomationElement Focus(IntPtr window,uint pid){
    if(changed!=null)throw new Exception(changed);
    LiveWriter.CheckWindow(window,pid);
    // DOM replacement briefly leaves no accessible focused element. Observe only.
    for(int attempt=0;attempt<11;attempt++){
      if(changed!=null)throw new Exception(changed);
      LiveWriter.CheckWindow(window,pid);
      try{
        var e=AutomationElement.FocusedElement;
        if(e!=null&&LiveWriter.BelongsToWindow(e,window)){
          if(e.Current.IsPassword)throw new Exception("パスワード欄には入力できません。");
          if(e.Current.ControlType!=ControlType.Window&&e.Current.ControlType!=ControlType.Pane)return e;
        }
      }catch(ElementNotAvailableException){}
      Thread.Sleep(20);
    }
    throw new Exception("入力欄を確認できません。入力先を確認してください。");
  }
  static INPUT Key(ushort key,ushort scan,uint flags){return new INPUT{type=1,data=new UNION{keyboard=new KEYBOARD{key=key,scan=scan,flags=flags,extra=new UIntPtr(Tag)}}};}
  static void Emit(object data){Console.WriteLine(new JavaScriptSerializer().Serialize(data));}
  public static int Run(IntPtr window,uint pid,uint own){
    excluded=own;var ready=new ManualResetEvent(false);string hookError=null;
    var hookThread=new Thread(()=>{
      keyHook=SetWindowsHookEx(13,keyboard,GetModuleHandle(null),0);mouseHook=SetWindowsHookEx(14,mouse,GetModuleHandle(null),0);
      if(keyHook==IntPtr.Zero||mouseHook==IntPtr.Zero)hookError="入力操作の監視を開始できません。";
      ready.Set();if(hookError==null)Application.Run();
    });hookThread.IsBackground=true;hookThread.SetApartmentState(ApartmentState.STA);hookThread.Start();
    if(!ready.WaitOne(5000))throw new Exception("入力監視の起動がタイムアウトしました。");
    if(hookError!=null)throw new Exception(hookError);
    string editor=null,automationId=null,baseline=null,left=null,right=null,emptyAdornment=null,written="";ControlType editorType=null;bool initialized=false;
    try{
      // EOF is cancellation, observed even while keys are being sent. This lets
      // the writer restore IME state before exiting instead of being killed.
      var requests=new BlockingCollection<string>();
      var reader=new Thread(()=>{try{string request;while((request=Console.ReadLine())!=null)requests.Add(request);}finally{changed="入力を中断しました。";requests.CompleteAdding();}});
      reader.IsBackground=true;reader.Start();
      foreach(string line in requests.GetConsumingEnumerable()){
        try{
          var r=new JavaScriptSerializer().Deserialize<StreamRequest>(line);
          if(r.kind=="start"){
            if(initialized)throw new Exception("入力監視は開始済みです。");
            shortcut=r.shortcut;LiveWriter.WaitReleased();LiveWriter.CheckWindow(window,pid);AutomationElement.FromHandle(window).FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.HasKeyboardFocusProperty,true));var e=Focus(window,pid);object v,t;
            bool editable=e.Current.ControlType==ControlType.Edit||e.Current.ControlType==ControlType.Custom;
            if(e.TryGetCurrentPattern(ValuePattern.Pattern,out v))editable=!((ValuePattern)v).Current.IsReadOnly;
            else if(e.TryGetCurrentPattern(TextPattern.Pattern,out t))editable=Object.Equals(((TextPattern)t).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute),false);
            if(!editable)throw new Exception("文字を入力できる欄にカーソルを置いてください。");
            if(e.TryGetCurrentPattern(TextPattern.Pattern,out t)){
              var selection=((TextPattern)t).GetSelection();
              if((selection.Length!=1||selection[0].CompareEndpoints(System.Windows.Automation.Text.TextPatternRangeEndpoint.Start,selection[0],System.Windows.Automation.Text.TextPatternRangeEndpoint.End)!=0)&&!(e.Current.FrameworkId=="Chrome"&&Value(e)==""))throw new Exception("文字の選択を解除してから録音してください。");
            }
            editor=Id(e);automationId=e.Current.AutomationId;editorType=e.Current.ControlType;baseline=Value(e);
            if(baseline==""&&e.Current.FrameworkId=="Chrome"){left="";right="";}else if(baseline!=null&&e.TryGetCurrentPattern(TextPattern.Pattern,out t)){var initial=LiveWriter.Read(window,pid);left=initial.before;right=initial.after;}
            // Some Chromium editors expose their empty-field prompt as real text.
            // Keep it as baseline until the first insertion proves that it disappears.
            if(e.Current.FrameworkId=="Chrome"&&left==""&&right==baseline&&!String.IsNullOrEmpty(e.Current.Name)&&baseline=="\n"+e.Current.Name)emptyAdornment=baseline;
            if(baseline!=null&&baseline.Length>200000)throw new Exception("入力先の文章が検証上限を超えています。");changed=null;active=true;initialized=true;
            Emit(new {ready=true,verification=baseline==null?"input-monitor":"value-and-input-monitor"});continue;
          }
          if(r.kind!="write"||!initialized||r.text==null||r.text.Length>12000)throw new Exception("入力要求が不正です。");
          var element=Focus(window,pid);string current=Value(element);
          if(Id(element)!=editor){if(baseline==null||String.IsNullOrEmpty(automationId)||element.Current.AutomationId!=automationId||element.Current.ControlType!=editorType)throw new Exception("入力欄が変わったため自動入力を停止しました。");editor=Id(element);}
          if(baseline!=current){
            bool emptyBlock=false;
            if(written==""&&left!=null){var empty=LiveWriter.Read(window,pid);emptyBlock=empty.before==left&&empty.after==right;}
            if(!emptyBlock)throw new Exception("入力先の文章が変更されたため自動入力を停止しました。");
            baseline=current;
          }
          int common=0;while(common<written.Length&&common<r.text.Length&&written[common]==r.text[common])common++;
          foreach(char c in written.Substring(common))if(Char.IsSurrogate(c)||Char.IsControl(c)||Char.GetUnicodeCategory(c)==System.Globalization.UnicodeCategory.NonSpacingMark||Char.GetUnicodeCategory(c)==System.Globalization.UnicodeCategory.SpacingCombiningMark||Char.GetUnicodeCategory(c)==System.Globalization.UnicodeCategory.EnclosingMark)throw new Exception("絵文字・結合文字の削除単位を確認できないため修正を停止しました。");
          foreach(char c in r.text.Substring(common))if(Char.IsControl(c)||Char.IsSurrogate(c))throw new Exception("改行・絵文字を含む自動入力は履歴からコピーしてください。");
          if(common<written.Length){
            object textPattern;
            if(element.TryGetCurrentPattern(TextPattern.Pattern,out textPattern)){
              var tp=(TextPattern)textPattern;var ranges=tp.GetSelection();
              if(ranges.Length!=1||ranges[0].CompareEndpoints(System.Windows.Automation.Text.TextPatternRangeEndpoint.Start,ranges[0],System.Windows.Automation.Text.TextPatternRangeEndpoint.End)!=0)throw new Exception("選択範囲が変わったため修正を停止しました。");
              if(left!=null){var preceding=tp.DocumentRange.Clone();preceding.MoveEndpointByRange(System.Windows.Automation.Text.TextPatternRangeEndpoint.End,ranges[0],System.Windows.Automation.Text.TextPatternRangeEndpoint.Start);if(preceding.GetText(200001)!=left+written)throw new Exception("カーソル位置が変わったため修正を停止しました。");}
            }
          }
          var batch=new List<INPUT>();for(int i=common;i<written.Length;i++){batch.Add(Key(8,0,0));batch.Add(Key(8,0,2));}
          foreach(char c in r.text.Substring(common)){batch.Add(Key(0,c,4));batch.Add(Key(0,c,6));}
          Focus(window,pid);
          var gui=new GUIINFO{size=(uint)Marshal.SizeOf(typeof(GUIINFO))};
          if(!GetGUIThreadInfo(0,ref gui))throw new Exception("入力先のIMEを確認できません。");
          IntPtr ime=ImmGetDefaultIMEWnd(gui.focus);bool restoreIme=batch.Count>0&&ime!=IntPtr.Zero&&ImeOpen(ime);
          try{
          if(restoreIme){SetIme(ime,false);if(Value(Focus(window,pid))!=current)throw new Exception("変換中の文字が変わりました。IMEの変換を確定してから録音してください。");}
          // Rich editors may update their selection after each key event.
          // Pace key pairs so suffix deletion and insertion retain their order.
          for(int i=0;i<batch.Count;i+=2){
            if(changed!=null)throw new Exception(changed);
            LiveWriter.CheckWindow(window,pid);
            var pair=new INPUT[]{batch[i],batch[i+1]};
            if(SendInput(2,pair,Marshal.SizeOf(typeof(INPUT)))!=2)throw new Exception("Windowsがキー入力を拒否、または一部だけ受け付けました。重複を避けるため再送しません。");
            Thread.Sleep(10);
          }
          if(baseline!=null&&batch.Count>0){
            bool found=false;var timer=System.Diagnostics.Stopwatch.StartNew();
            do{
              try {
              element=Focus(window,pid);if(Id(element)!=editor){if(String.IsNullOrEmpty(automationId)||element.Current.AutomationId!=automationId||element.Current.ControlType!=editorType)throw new Exception("入力中に入力欄が変わりました。");editor=Id(element);}current=Value(element);
              if(left!=null){
                if(emptyAdornment!=null&&written==""&&current==r.text){left="";right="";found=true;break;}
                if(emptyAdornment!=null&&left==""&&right==""&&r.text==""&&current==emptyAdornment){found=true;break;}
                if(current==left+r.text+right || left==""&&right==""&&r.text==""&&current=="\n"){found=true;break;}
                if(r.text==""){var empty=LiveWriter.Read(window,pid);if(empty.before==left&&empty.after==right){found=true;break;}}
              }
              else if(current!=null){
                if(current.Length==baseline.Length+r.text.Length){
                  int prefix=0,suffix=0;
                  while(prefix<baseline.Length&&baseline[prefix]==current[prefix])prefix++;
                  while(suffix<baseline.Length&&baseline[baseline.Length-1-suffix]==current[current.Length-1-suffix])suffix++;
                  int lower=baseline.Length-suffix,upper=prefix,pos=lower;
                  if(lower<upper){
                    object pattern;
                    if(element.TryGetCurrentPattern(TextPattern.Pattern,out pattern)){
                      var tp=(TextPattern)pattern;var sel=tp.GetSelection();
                      if(sel.Length==1){var preceding=tp.DocumentRange.Clone();preceding.MoveEndpointByRange(System.Windows.Automation.Text.TextPatternRangeEndpoint.End,sel[0],System.Windows.Automation.Text.TextPatternRangeEndpoint.Start);pos=preceding.GetText(200001).Length-r.text.Length;}
                    }else pos=-1;
                  }
                  if(pos>=lower&&pos<=upper&&pos>=0&&pos<=baseline.Length&&current==baseline.Substring(0,pos)+r.text+baseline.Substring(pos)){left=baseline.Substring(0,pos);right=baseline.Substring(pos);found=true;}
                }
                if(!found&&baseline=="\n"&&current==r.text){left="";right="";found=true;}
                if(found)break;
              }
              }catch(ElementNotAvailableException){/* Re-render: retry observation only, never the key. */}
              Thread.Sleep(20);
            }while(timer.ElapsedMilliseconds<2000);
            if(!found)throw new Exception("入力後の本文を確認できません。再送せず停止しました。文章は履歴で確認してください。");
            baseline=current;
          }
          }finally{if(restoreIme)SetIme(ime,true);}
          written=r.text;Emit(new {written=written,verified=baseline!=null});
        }catch(Exception e){changed=String.IsNullOrWhiteSpace(e.Message)?"入力監視エラー: "+e.GetType().Name:e.Message;Emit(new {error=changed});}
      }
    }finally{active=false;if(keyHook!=IntPtr.Zero)UnhookWindowsHookEx(keyHook);if(mouseHook!=IntPtr.Zero)UnhookWindowsHookEx(mouseHook);}
    return 0;
  }
}
