using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Threading;
// A tap is cancelled by any other key or mouse action; auto-repeat never retriggers.
class ModifierTap {
 readonly int target;bool held,candidate;
 public ModifierTap(int target){this.target=target;}
 public void Cancel(){candidate=false;}
 public bool Key(int key,bool down,bool otherHeld){
  if(key!=target){if(down)candidate=false;return false;}
  if(down){if(!held){held=true;candidate=!otherHeld;}return false;}
  bool fire=held&&candidate;held=false;candidate=false;return fire;
 }
}
static class ModifierShortcut {
 delegate IntPtr Hook(int code,IntPtr msg,IntPtr data);
 [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SetWindowsHookEx(int id,Hook callback,IntPtr module,uint thread);
 [DllImport("user32.dll")]static extern bool UnhookWindowsHookEx(IntPtr hook);
 [DllImport("user32.dll")]static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr msg,IntPtr data);
 [DllImport("kernel32.dll")]static extern IntPtr GetModuleHandle(string name);
 [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
 static Hook keyboard=OnKey,mouse=OnMouse;static IntPtr kh,mh;static int target;static ModifierTap tap;
 static IntPtr OnKey(int code,IntPtr msg,IntPtr data){
  if(code>=0&&(Marshal.ReadInt32(data,8)&0x10)==0){
   int key=Marshal.ReadInt32(data),m=msg.ToInt32();bool down=m==0x100||m==0x104;
   bool otherHeld=false;
   if(key==target&&down)for(int k=1;k<256;k++)if(k!=target&&k!=16&&k!=17&&k!=18&&(GetAsyncKeyState(k)&0x8000)!=0)otherHeld=true;
   if(tap.Key(key,down,otherHeld))Console.WriteLine("tap");
  }
  return CallNextHookEx(kh,code,msg,data);
 }
 static IntPtr OnMouse(int code,IntPtr msg,IntPtr data){int m=msg.ToInt32();if(code>=0&&(m==0x201||m==0x204||m==0x207||m==0x20B||m==0x20A||m==0x20E))tap.Cancel();return CallNextHookEx(mh,code,msg,data);}
 [STAThread]static int Main(string[] args){
  try{target=int.Parse(args[0]);if(target<162||target>165)throw new Exception("Invalid modifier");tap=new ModifierTap(target);
   kh=SetWindowsHookEx(13,keyboard,GetModuleHandle(null),0);mh=SetWindowsHookEx(14,mouse,GetModuleHandle(null),0);
   if(kh==IntPtr.Zero||mh==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
   var reader=new Thread(()=>{while(Console.ReadLine()!=null){}Environment.Exit(0);});reader.IsBackground=true;reader.Start();Console.WriteLine("ready");Application.Run();return 0;
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}finally{if(kh!=IntPtr.Zero)UnhookWindowsHookEx(kh);if(mh!=IntPtr.Zero)UnhookWindowsHookEx(mh);}
 }
}
