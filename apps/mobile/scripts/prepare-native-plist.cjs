// Build-tool compatibility only; keep the secured xmldom version pinned.
const fs = require('node:fs');
const path = require.resolve('@expo/plist/build/parse.js');
const source = fs.readFileSync(path, 'utf8');
const oldCall = '.parseFromString(xml)';
const newCall = '.parseFromString(xml.trimStart(), "text/xml")';
if (source.includes(newCall)) {
  console.log('Native plist compatibility already installed.');
} else {
  if (source.split(oldCall).length !== 2) {
    throw new Error('Unexpected @expo/plist parser; review compatibility before building.');
  }
  fs.writeFileSync(path, source.replace(oldCall, newCall));
  console.log('Native plist compatibility installed.');
}
