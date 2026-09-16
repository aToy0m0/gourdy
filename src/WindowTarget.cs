using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Short-lived helper. Key-release polling runs only during a command (up to 30 seconds).
class WindowTarget {
  delegate bool EnumProc(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int size);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  static object PickPaste(uint excluded) {
    LiveWriter.WaitReleased();GetAsyncKeyState(27);
    var timer=Stopwatch.StartNew();
    while(timer.ElapsedMilliseconds<30000) {
      if((GetAsyncKeyState(27)&0x8001)!=0)throw new Exception("貼り付けをキャンセルしました。");
      if((GetAsyncKeyState(1)&0x8000)!=0) {
        LiveWriter.WaitReleased();Thread.Sleep(80);
        var window=GetForegroundWindow();uint pid;GetWindowThreadProcessId(window,out pid);
        if(pid==excluded)throw new Exception("入力先のアプリ内をクリックしてください。");
        // A user click places the caret. Never move focus to another window here.
        var element=System.Windows.Automation.AutomationElement.FocusedElement;
        if(element==null||!LiveWriter.BelongsToWindow(element,window)||element.Current.IsPassword)throw new Exception("入力欄を確認できません。パスワード欄には貼り付けできません。");
        object valuePattern,textPattern;
        bool editable=element.Current.ControlType==System.Windows.Automation.ControlType.Edit;
        if(element.TryGetCurrentPattern(System.Windows.Automation.ValuePattern.Pattern,out valuePattern))editable=!((System.Windows.Automation.ValuePattern)valuePattern).Current.IsReadOnly;
        else if(element.TryGetCurrentPattern(System.Windows.Automation.TextPattern.Pattern,out textPattern))editable=Object.Equals(((System.Windows.Automation.TextPattern)textPattern).DocumentRange.GetAttributeValue(System.Windows.Automation.TextPattern.IsReadOnlyAttribute),false);
        if(!editable)throw new Exception("文字を入力できる欄をクリックしてください。");
        if(window!=GetForegroundWindow())throw new Exception("入力先が変わったため貼り付けを中止しました。");
        SendKeys.SendWait("^v");return new {ok=true};
      }
      Thread.Sleep(10);
    }
    throw new Exception("入力先が選択されなかったため貼り付けを中止しました。");
  }
  static object Describe(IntPtr window, uint excluded) {
    uint pid; GetWindowThreadProcessId(window, out pid);
    var title = new StringBuilder(1024); GetWindowText(window, title, title.Capacity);
    if (pid == excluded || title.Length == 0 || !IsWindowVisible(window)) return null;
    return new { handle = window.ToInt64().ToString(), pid = pid, title = title.ToString() };
  }
  [STAThread] static int Main(string[] args) {
    Console.OutputEncoding = new UTF8Encoding(false);
    Console.InputEncoding = new UTF8Encoding(false);
    try {
      if(args.Length==4 && args[0]=="realtime")return RealtimeInput.Run(new IntPtr(Int64.Parse(args[1])),UInt32.Parse(args[2]),UInt32.Parse(args[3]));
      object result;
      if(args.Length==2 && args[0]=="wait-release") {
        var keys=new JavaScriptSerializer().Deserialize<int[]>(Console.In.ReadToEnd());
        if(keys==null||keys.Length<2||keys.Length>5)throw new Exception("コマンドキーが不正です。");
        var timer=Stopwatch.StartNew();bool released=false;
        while(timer.ElapsedMilliseconds<30000) {
          if((GetAsyncKeyState(27)&0x8000)!=0)throw new Exception("コマンドをキャンセルしました。");
          foreach(int key in keys) {
            if(key<1||key>255)throw new Exception("コマンドキーが不正です。");
            bool held=(GetAsyncKeyState(key)&0x8000)!=0 || key==91&&(GetAsyncKeyState(92)&0x8000)!=0;
            if(!held)released=true;
          }
          if(released)break; Thread.Sleep(10);
        }
        if(!released)throw new Exception("コマンドは30秒までです。キーを離してください。");
        Console.WriteLine("{\"released\":true}");return 0;
      }
      if(args.Length==3 && args[0]=="command-start") result=LiveWriter.CommandStart(new IntPtr(Int64.Parse(args[1])),UInt32.Parse(args[2]));
      else if(args.Length==3 && args[0]=="command") result=CommandWriter.Run(new IntPtr(Int64.Parse(args[1])),UInt32.Parse(args[2]),new JavaScriptSerializer().Deserialize<CommandRequest>(Console.In.ReadToEnd()));
      else
      if(args.Length==2 && args[0]=="pick-paste") result=PickPaste(UInt32.Parse(args[1]));
      else if (args.Length == 3 && args[0] == "live-start") result = LiveWriter.Start(new IntPtr(Int64.Parse(args[1])), UInt32.Parse(args[2]));
      else if (args.Length == 3 && args[0] == "live-write") result = LiveWriter.Write(new IntPtr(Int64.Parse(args[1])), UInt32.Parse(args[2]), new JavaScriptSerializer().Deserialize<LiveRequest>(Console.In.ReadToEnd()));
      else if (args.Length == 2 && args[0] == "capture") result = Describe(GetForegroundWindow(), UInt32.Parse(args[1]));
      else if (args.Length == 2 && args[0] == "list") {
        var list = new List<object>(); var excluded = UInt32.Parse(args[1]);
        EnumWindows(delegate(IntPtr window, IntPtr data) { var entry = Describe(window, excluded); if (entry != null) list.Add(entry); return true; }, IntPtr.Zero);
        result = list;
      } else if (args.Length == 3 && (args[0] == "focus" || args[0] == "paste")) {
        var window = new IntPtr(Int64.Parse(args[1])); var expected = UInt32.Parse(args[2]);
        uint actual; GetWindowThreadProcessId(window, out actual);
        if (!IsWindow(window) || actual != expected) throw new Exception("入力先のウィンドウは閉じられています。選び直してください。");
        if (IsIconic(window)) ShowWindow(window, 9);
        if (GetForegroundWindow() != window && !SetForegroundWindow(window)) throw new Exception("Windowsがフォーカスの移動を許可しませんでした。入力先を手動で開いてください。");
        if (args[0] == "paste") {
          Thread.Sleep(120);
          if (GetForegroundWindow() != window) throw new Exception("入力先のフォーカスが変わったため、貼り付けを中止しました。");
          SendKeys.SendWait("^v");
        }
        result = new { ok = true };
      } else throw new Exception("ウィンドウ操作の引数が不正です。");
      Console.WriteLine(new JavaScriptSerializer().Serialize(result)); return 0;
    } catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
  }
}
