' Bat server dieuphoi khong hien cua so. Dung: Task Manager, ket thuc python dang chay tools\dp.py va cmd cua serve-hidden.cmd.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c """ & here & "\serve-hidden.cmd""", 0, False
