"""Build AIGameBuilder.rbxmx from AIGameBuilder.lua (RunContext = Plugin = 3)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
lua = (ROOT / "AIGameBuilder.lua").read_text(encoding="utf-8")
if "]]>" in lua:
    raise SystemExit("AIGameBuilder.lua must not contain ]]> (CDATA break)")

# Omit RunContext — match VibeCoderInstaller.rbxmx; wrong token breaks load in Studio.
xml = f"""<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" version="4">
  <Item class="Script" referent="RBX_AIGameBuilder">
    <Properties>
      <string name="Name">AIGameBuilder</string>
      <bool name="Disabled">false</bool>
      <ProtectedString name="Source"><![CDATA[{lua}]]></ProtectedString>
    </Properties>
  </Item>
</roblox>
"""
(ROOT / "AIGameBuilder.rbxmx").write_text(xml, encoding="utf-8")
print("OK:", ROOT / "AIGameBuilder.rbxmx")
