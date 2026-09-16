using System;
using System.Collections.Generic;
using System.Globalization;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;

class LiveState {
  public string before { get; set; }
  public string after { get; set; }
  public string editor { get; set; }
  public string written { get; set; }
  public string selected { get; set; }
}
class LiveRequest {
  public LiveState state { get; set; }
  public string text { get; set; }
}
static class LiveWriter {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION data; }
  [StructLayout(LayoutKind.Explicit, Size=32)] struct UNION { [FieldOffset(0)] public KEYBOARD keyboard; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBOARD { public ushort key, scan; public uint flags, time; public UIntPtr extra; }
  static bool InputHeld() {
    foreach(int key in new int[]{16,17,18,91,92,1,2}) if((GetAsyncKeyState(key)&0x8000)!=0)return true;
    return false;
  }
  static string HeldInputNames() {
    var names=new List<string>();
    foreach(int key in new int[]{16,17,18,91,92,1,2})if((GetAsyncKeyState(key)&0x8000)!=0)names.Add(((System.Windows.Forms.Keys)key).ToString());
    return String.Join(", ",names.ToArray());
  }
  public static void WaitReleased() {
    var timer=Stopwatch.StartNew();
    while (true) {
      if(!InputHeld())return;
      if(timer.ElapsedMilliseconds>2000)throw new Exception("キーとマウスを離してから録音を開始してください。");
      Thread.Sleep(20);
    }
  }
  public static void CheckWindow(IntPtr window, uint pid, bool held = false) {
    var timer=Stopwatch.StartNew();
    while(true) {
      uint actual; GetWindowThreadProcessId(window, out actual);
      if (actual != pid || GetForegroundWindow() != window) throw new Exception("入力先が変わったため自動入力を停止しました。録音内容はアプリに残ります。");
      if(held || !InputHeld())return;
      // A mic click or global-shortcut release is not a change of editor.
      // Read/Verify still validates text and caret AFTER this bounded wait.
      if(timer.ElapsedMilliseconds>=2000)throw new Exception("Windowsのキー状態を確認できず自動入力を停止しました（検出: "+HeldInputNames()+"、2秒継続）。録音内容は履歴で確認できます。");
      Thread.Sleep(20);
    }
  }
  public static bool BelongsToWindow(AutomationElement element,IntPtr window) {
    for(int depth=0;depth<64&&element!=null;depth++) {
      if(element.Current.NativeWindowHandle==window.ToInt32())return true;
      element=TreeWalker.RawViewWalker.GetParent(element);
    }
    return false;
  }
  static string RangeText(TextPatternRange range) {
    return range.CompareEndpoints(TextPatternRangeEndpoint.Start,range,TextPatternRangeEndpoint.End)==0?"":range.GetText(200001);
  }
  public static LiveState Read(IntPtr window, uint pid, bool held = false, bool selectionAllowed = false) {
    CheckWindow(window, pid, held);
    var editor = AutomationElement.FocusedElement;
    if (editor == null || !BelongsToWindow(editor,window) || editor.Current.IsPassword) throw new Exception("入力欄を確認できません。メモ帳の文字欄にカーソルを置いてください。");
    object pattern=null;
    // Some editors focus a child of the element that exposes the text range.
    for(int depth=0;depth<8&&editor!=null;depth++) {
      if(!BelongsToWindow(editor,window)||editor.Current.IsPassword)break;
      if(editor.TryGetCurrentPattern(TextPattern.Pattern,out pattern))break;
      editor=TreeWalker.ControlViewWalker.GetParent(editor);
    }
    if(pattern==null)throw new Exception("この入力欄のカーソル位置を取得できません。履歴の「クリックして貼り付け」を使用してください。");
    var text = (TextPattern)pattern;
    if (Object.Equals(text.DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute), true)) throw new Exception("読み取り専用の入力欄です。");
    var selection = text.GetSelection();
    if (selection.Length != 1 || !selectionAllowed && selection[0].CompareEndpoints(TextPatternRangeEndpoint.Start, selection[0], TextPatternRangeEndpoint.End) != 0) throw new Exception("文字が選択されているため自動入力を停止しました。");
    var before = text.DocumentRange.Clone();
    before.MoveEndpointByRange(TextPatternRangeEndpoint.End, selection[0], TextPatternRangeEndpoint.Start);
    var after = text.DocumentRange.Clone();
    after.MoveEndpointByRange(TextPatternRangeEndpoint.Start, selection[0], TextPatternRangeEndpoint.End);
    var result = new LiveState { before = RangeText(before), after = RangeText(after), editor = String.Join(",", Array.ConvertAll(editor.GetRuntimeId(), x => x.ToString())), written = "", selected = RangeText(selection[0]) };
    if (result.before.Length + result.after.Length + result.selected.Length > 200000) throw new Exception("入力先の文章が検証上限を超えています。新しいメモ帳で開始してください。");
    // Empty Chromium rich editors may expose their accessible name or a block LF
    // through TextPattern. ValuePattern distinguishes these from actual user text.
    if(result.selected=="" && editor.Current.FrameworkId=="Chrome") {
      object valuePattern;
      if(editor.TryGetCurrentPattern(ValuePattern.Pattern,out valuePattern)) {
        string value=((ValuePattern)valuePattern).Current.Value;
        if(value=="" || value=="\n"){result.before="";result.after="";}
        else {
          var enclosing=selection[0].GetEnclosingElement();
          // Chromium reports an empty paragraph's caret BEFORE its separator.
          // Only relocate that separator when the enclosing child is an empty block.
          if(result.before.Length>0 && result.after.StartsWith("\n",StringComparison.Ordinal) &&
              enclosing.Current.ControlType==ControlType.Group && !Automation.Compare(enclosing,editor)) {
            string block=RangeText(text.RangeFromChild(enclosing));
            if(block=="" || block=="\n") {result.before+="\n";if(result.after=="\n")result.after="";}
          }
          else if(result.after=="\n" && value==result.before)result.after="";
        }
      }
    }
    return result;
  }
  static bool Matches(LiveState actual, LiveState expected) {
    return actual.editor == expected.editor && actual.before == expected.before && actual.after == expected.after && (actual.selected??"") == (expected.selected??"");
  }
  public static void Verify(IntPtr window, uint pid, LiveState expected, bool selectionAllowed = false) {
    if (!Matches(Read(window, pid, false, selectionAllowed), expected)) throw new Exception("文章・カーソル・入力欄の変更を検出したため自動入力を停止しました。既存の文章は修正しません。");
  }
  static void Key(ushort key, ushort scan, uint flags) {
    var inputs = new INPUT[] {
      new INPUT { type=1, data=new UNION { keyboard=new KEYBOARD { key=key, scan=scan, flags=flags } } },
      new INPUT { type=1, data=new UNION { keyboard=new KEYBOARD { key=key, scan=scan, flags=flags|2 } } }
    };
    if (SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT))) != 2) throw new Exception("Windowsがキー入力を拒否しました。自動入力を停止しました。");
  }
  static void AwaitChange(IntPtr window, uint pid, LiveState expected) {
    var timer=Stopwatch.StartNew();
    LiveState actual;
    do {
      actual=Read(window, pid);
      if(Matches(actual, expected))return;
      // Wait for the provider to reflect the ONE key already sent. Never resend it.
      Thread.Sleep(20);
    } while(timer.ElapsedMilliseconds<2000);
    throw new Exception("キー入力後の文章を確認できません。自動入力を停止しました（2秒待機、入力欄: "+
      (actual.editor==expected.editor?"一致":"変更")+"、カーソル前: "+
      (actual.before==expected.before?"一致":"不一致 "+actual.before.Length+"/"+expected.before.Length)+"、カーソル後: "+
      (actual.after==expected.after?"一致":"不一致 "+actual.after.Length+"/"+expected.after.Length)+"、選択: "+
      ((actual.selected??"")==(expected.selected??"")?"一致":"変更")+"）。録音内容は履歴で確認できます。");
  }

  public static LiveState Start(IntPtr window, uint pid) {
    // The global shortcut may still be physically held at invocation time.
    WaitReleased();
    CheckWindow(window,pid);
    // Request the focused provider before reading it; Chromium may expose its tree lazily.
    AutomationElement.FromHandle(window).FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.HasKeyboardFocusProperty,true));
    return Read(window, pid);
  }
  public static LiveState CommandStart(IntPtr window, uint pid) { return Read(window, pid, true, true); }
  public static LiveState Write(IntPtr window, uint pid, LiveRequest request) {
    var state = request.state; var next = request.text;
    if (state == null || state.before == null || state.after == null || state.written == null || next == null || next.Length > 12000 || !state.before.EndsWith(state.written, StringComparison.Ordinal)) throw new Exception("自動入力の状態が不正です。");
    Verify(window, pid, state);
    int common = 0;
    while (common < state.written.Length && common < next.Length && state.written[common] == next[common]) common++;
    // Backspace units vary across editors for surrogate pairs and combining marks.
    foreach (char ch in state.written.Substring(common)) {
      var category = Char.GetUnicodeCategory(ch);
      if (Char.IsSurrogate(ch) || Char.IsControl(ch) || category == UnicodeCategory.NonSpacingMark || category == UnicodeCategory.SpacingCombiningMark || category == UnicodeCategory.EnclosingMark) throw new Exception("絵文字・結合文字・改行の削除単位を確認できないため自動修正を停止しました。");
    }
    foreach (char ch in next.Substring(common)) if (Char.IsControl(ch) || Char.IsSurrogate(ch)) throw new Exception("改行や絵文字は連続入力の対象外です。アプリからコピーしてください。");
    while (state.written.Length > common) {
      Verify(window, pid, state);
      Key(8, 0, 0); // Actual Backspace down/up, only over our verified suffix.
      state.before = state.before.Substring(0, state.before.Length-1);
      state.written = state.written.Substring(0, state.written.Length-1);
      AwaitChange(window, pid, state);
    }
    foreach (char ch in next.Substring(common)) {
      Verify(window, pid, state);
      Key(0, ch, 4); // Unicode keyboard input; clipboard is untouched.
      state.before += ch; state.written += ch;
      AwaitChange(window, pid, state);
    }
    return state;
  }
}
