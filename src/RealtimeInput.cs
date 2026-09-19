using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;
using System.Web.Script.Serialization;

class StreamRequest {public string kind {get;set;} public string text {get;set;} public string prior {get;set;} public int[] shortcut {get;set;}}
// One lightweight process per recording. Hooks observe real user edits independently
// of the application's accessibility text/caret update cadence.
class NoInputTargetException : Exception {public NoInputTargetException(string message):base(message){}}
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
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr SendMessageTimeout(IntPtr window,uint message,IntPtr wparam,IntPtr lparam,uint flags,uint timeout,out IntPtr result);
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
  // Missing UIA metadata selects generic keys before the first write. It must
  // never switch delivery after text was sent. Native focus/hooks still guard it.
  static string Property(AutomationElement e,AutomationProperty property){
    if(e==null)return null;
    try{return e.GetCurrentPropertyValue(property,true) as string;}
    catch(ElementNotAvailableException){return null;}catch(COMException){return null;}
  }
  // Manual paste-current still compares the UIA runtime identity when available.
  // Realtime writes do not depend on it.
  static string EditorId(AutomationElement e){
    if(e==null)return null;
    try{return String.Join(",",Array.ConvertAll(e.GetRuntimeId(),x=>x.ToString()));}
    catch(ElementNotAvailableException){return null;}catch(COMException){return null;}
  }
  static string Value(AutomationElement e){object p;return e.TryGetCurrentPattern(ValuePattern.Pattern,out p)?((ValuePattern)p).Current.Value:null;}
  static AutomationElement Focus(IntPtr window,uint pid){
    if(changed!=null)throw new Exception(changed);
    LiveWriter.CheckWindow(window,pid);
    try{
      var e=AutomationElement.FocusedElement;
      if(e!=null&&LiveWriter.BelongsToWindow(e,window)){
        if(e.Current.IsPassword)throw new NoInputTargetException("パスワード欄には入力できません。");
        var kind=e.Current.ControlType;
        if(kind==ControlType.Button||kind==ControlType.CheckBox||kind==ControlType.RadioButton||kind==ControlType.MenuItem||kind==ControlType.Hyperlink||kind==ControlType.Slider)
          throw new NoInputTargetException("文字を入力する欄が選ばれていません。");
        object value;
        if(kind==ControlType.Edit&&e.TryGetCurrentPattern(ValuePattern.Pattern,out value)&&((ValuePattern)value).Current.IsReadOnly)
          throw new NoInputTargetException("読み取り専用の欄には入力できません。");
        return e;
      }
    }catch(ElementNotAvailableException){}catch(COMException){}
    // Accessibility is optional. Native focus + physical-input hooks remain active.
    return null;
  }
  static IntPtr NativeFocus(){
    var gui=new GUIINFO{size=(uint)Marshal.SizeOf(typeof(GUIINFO))};
    if(!GetGUIThreadInfo(0,ref gui)||gui.focus==IntPtr.Zero)throw new NoInputTargetException("キーボードの入力先を確認できません。");
    return gui.focus;
  }
  static string Observe(AutomationElement e){
    if(e==null)return null;
    try{return Value(e);}catch(ElementNotAvailableException){return null;}catch(COMException){return null;}
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
    string written="",automationId=null,framework=null;IntPtr nativeFocus=IntPtr.Zero;bool initialized=false,qt=false;
    try{
      var requests=new BlockingCollection<string>();
      var reader=new Thread(()=>{try{string request;while((request=Console.ReadLine())!=null)requests.Add(request);}finally{changed="入力を中断しました。";requests.CompleteAdding();}});
      reader.IsBackground=true;reader.Start();
      foreach(string line in requests.GetConsumingEnumerable()){
        bool mayHaveWritten=false;
        try{
          var r=new JavaScriptSerializer().Deserialize<StreamRequest>(line);
          if(r.kind=="start"){
            if(initialized)throw new Exception("入力監視は開始済みです。");
            shortcut=r.shortcut;LiveWriter.WaitReleased();changed=null;active=true;var e=Focus(window,pid);
            nativeFocus=NativeFocus();automationId=Property(e,AutomationElement.AutomationIdProperty);
            framework=Property(e,AutomationElement.FrameworkIdProperty);qt=framework=="Qt";
            if(!String.IsNullOrEmpty(r.prior)){
              // A new session must not delete text merely on another session's memory.
              var prior=LiveWriter.Read(window,pid);
              if(r.prior.Length>12000||!prior.before.EndsWith(r.prior,StringComparison.Ordinal))throw new Exception("元の入力済み文章の末尾を確認できません。選択して入力するかコピーしてください。");
              written=r.prior;
            }
            initialized=true;
            Emit(new {ready=true,editor=EditorId(e)??"native:"+nativeFocus,framework=framework,delivery=qt?"qt-unicode-message":"unicode-keys",deliveryReason=String.IsNullOrEmpty(framework)?"framework-unavailable":"framework",verification="input-monitor",verificationReason="sent-text-ledger"});continue;
          }
          if(r.kind!="write"||!initialized||r.text==null||r.text.Length>12000)throw new Exception("入力要求が不正です。");
          var element=Focus(window,pid);
          if(NativeFocus()!=nativeFocus)throw new Exception("キーボードの入力先が変わったため自動入力を停止しました。");
          string currentId=Property(element,AutomationElement.AutomationIdProperty);
          if(!String.IsNullOrEmpty(automationId)&&!String.IsNullOrEmpty(currentId)&&currentId!=automationId)throw new Exception("入力欄が変わったため自動入力を停止しました。");
          int common=0;while(common<written.Length&&common<r.text.Length&&written[common]==r.text[common])common++;
          foreach(char c in written.Substring(common))if(Char.IsSurrogate(c)||Char.IsControl(c)||Char.GetUnicodeCategory(c)==System.Globalization.UnicodeCategory.NonSpacingMark||Char.GetUnicodeCategory(c)==System.Globalization.UnicodeCategory.SpacingCombiningMark||Char.GetUnicodeCategory(c)==System.Globalization.UnicodeCategory.EnclosingMark)throw new Exception("絵文字・結合文字の削除単位を確認できないため修正を停止しました。");
          foreach(char c in r.text.Substring(common))if(Char.IsControl(c)||Char.IsSurrogate(c))throw new Exception("改行・絵文字を含む自動入力は履歴からコピーしてください。");
          IntPtr ime=ImmGetDefaultIMEWnd(nativeFocus);bool restoreIme=ime!=IntPtr.Zero&&ImeOpen(ime);
          try{
            if(restoreIme)SetIme(ime,false);
            var batch=new List<INPUT>();
            for(int i=common;i<written.Length;i++){batch.Add(Key(8,0,0));batch.Add(Key(8,0,2));}
            foreach(char c in r.text.Substring(common)){batch.Add(Key(0,c,4));batch.Add(Key(0,c,6));}
            for(int i=0;i<batch.Count;i+=2){
              if(changed!=null)throw new Exception(changed);
              LiveWriter.CheckWindow(window,pid);
              if(NativeFocus()!=nativeFocus)throw new Exception("キーボードの入力先が変わったため自動入力を停止しました。");
              mayHaveWritten=true;
              // Qt can mis-handle VK_PACKET. Use synchronous Unicode WM_CHAR only for Qt.
              if(qt&&batch[i].data.keyboard.key==0){
                IntPtr result;
                if(SendMessageTimeout(nativeFocus,0x102,new IntPtr(batch[i].data.keyboard.scan),new IntPtr(1),2,1000,out result)==IntPtr.Zero)throw new Exception("文字送信がタイムアウトしました。重複を避けるため再送しません。");
              }else if(SendInput(2,new INPUT[]{batch[i],batch[i+1]},Marshal.SizeOf(typeof(INPUT)))!=2)throw new Exception("Windowsがキー入力を拒否、または一部だけ受け付けました。重複を避けるため再送しません。");
              Thread.Sleep(10);
            }
            written=r.text;
          }finally{if(restoreIme)SetIme(ime,true);}
          // Readback is diagnostic only: placeholders, partial values and stale
          // accessibility providers must not stop an otherwise unchanged input session.
          string observed=Observe(element);
          Emit(new {written=written,verified=false,verification="input-monitor",verificationReason="sent-text-ledger",delivery=qt?"qt-unicode-message":"unicode-keys",readback=observed==null?"unavailable":observed==written?"matches-sent-text":"different-or-contextual"});
        }catch(Exception e){
          changed=String.IsNullOrWhiteSpace(e.Message)?"入力監視エラー: "+e.GetType().Name:e.Message;
          Emit(new {error=changed,code=e is NoInputTargetException?"NO_INPUT_TARGET":null,mayHaveWritten=mayHaveWritten,confirmedWritten=(string)null});
        }
      }
    }finally{active=false;if(keyHook!=IntPtr.Zero)UnhookWindowsHookEx(keyHook);if(mouseHook!=IntPtr.Zero)UnhookWindowsHookEx(mouseHook);}
    return 0;
  }
}
