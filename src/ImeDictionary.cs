using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

[ComImport,Guid("019F7153-E6DB-11D0-83C3-00C04FDDB82E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IUserDictionary {
 [PreserveSig] int Open(IntPtr path,IntPtr header);
 [PreserveSig] int Close();
 [PreserveSig] int GetHeader(IntPtr path,IntPtr header,IntPtr format,IntPtr type);
 [PreserveSig] int DisplayProperty(IntPtr window);
 [PreserveSig] int GetPosTable(out IntPtr table,out int count);
 [PreserveSig] int GetWords(IntPtr first,IntPtr last,IntPtr display,uint pos,uint select,uint source,IntPtr buffer,uint size,out uint count);
 [PreserveSig] int NextWords(IntPtr buffer,uint size,out uint count);
}
class ImeDictionary {
 // msime.h uses byte packing, including on x64.
 [StructLayout(LayoutKind.Sequential,Pack=1)] struct Word {public IntPtr reading,display;public uint pos,attr1,attr2;public int commentSize,commentType;public IntPtr comment;}
 static void Check(int hr,string action){if(hr<0)throw new Exception(action+"に失敗しました (0x"+hr.ToString("X8")+")。Microsoft IMEのユーザー辞書を確認してください。");}
 [STAThread] static int Main(){Console.OutputEncoding=new UTF8Encoding(false);object com=null;IntPtr buffer=IntPtr.Zero;IUserDictionary dictionary=null;bool opened=false;
 try{
  var type=Type.GetTypeFromProgID("MSIME.Japan",false);if(type==null)throw new Exception("Microsoft IMEが見つかりません。自動取り込みはMicrosoft IMEのユーザー辞書に対応しています。");
  com=Activator.CreateInstance(type);dictionary=(IUserDictionary)com;Check(dictionary.Open(IntPtr.Zero,IntPtr.Zero),"ユーザー辞書の読み取り");opened=true;
  const uint size=65536;buffer=Marshal.AllocHGlobal((int)size);uint count;int hr=dictionary.GetWords(IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,0x1ffff,3,1,buffer,size,out count);
  var terms=new List<object>();int stride=Marshal.SizeOf(typeof(Word));
  while(true){
   if(hr==unchecked((int)0x80047304))break;
   Check(hr,"登録語の取得");if(count>size/stride)throw new Exception("辞書の応答件数が不正です。");
   for(int i=0;i<count;i++){var word=(Word)Marshal.PtrToStructure(IntPtr.Add(buffer,i*stride),typeof(Word));if(word.reading==IntPtr.Zero||word.display==IntPtr.Zero)throw new Exception("辞書の読み・表記を取得できません。");terms.Add(new {reading=Marshal.PtrToStringUni(word.reading),term=Marshal.PtrToStringUni(word.display)});}
   if(terms.Count>100000)throw new Exception("ユーザー辞書が取り込み上限の100000件を超えています。");
   if(hr==0)break;if(hr!=0x47200||count==0)throw new Exception("辞書の続きの取得に失敗しました。");
   hr=dictionary.NextWords(buffer,size,out count);
  }
  Check(dictionary.Close(),"ユーザー辞書の終了");opened=false;
  Console.WriteLine(new JavaScriptSerializer{MaxJsonLength=16000000}.Serialize(new {source="Microsoft IME",terms=terms}));return 0;
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
 finally{if(opened)dictionary.Close();if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);if(com!=null)Marshal.FinalReleaseComObject(com);}
 }
}
