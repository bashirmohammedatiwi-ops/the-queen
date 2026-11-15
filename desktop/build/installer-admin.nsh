; فتح منافذ الشبكة في جدار حماية ويندوز ليتصل الكاشير بجهاز الإدارة
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="The Queen Server"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="The Queen Discovery"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="The Queen Server" dir=in action=allow protocol=TCP localport=3000 profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="The Queen Discovery" dir=in action=allow protocol=UDP localport=41234 profile=any'
!macroend
!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="The Queen Server"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="The Queen Discovery"'
!macroend
