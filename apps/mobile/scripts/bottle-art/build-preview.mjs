import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const mobile = resolve(import.meta.dirname, '../..');
const out = resolve(process.argv[2] || 'bottle-art-preview');
mkdirSync(out, { recursive: true });
await build({absWorkingDir:mobile,stdin:{contents:'import React from "react"; import {createRoot} from "react-dom/client"; import Preview from "./scripts/bottle-art/Preview"; createRoot(document.getElementById("root")).render(<Preview/>);',resolveDir:mobile,loader:'tsx'},bundle:true,format:'iife',platform:'browser',jsx:'automatic',outfile:resolve(out,'preview.js'),alias:{'react-native':'react-native-web'},define:{'process.env.NODE_ENV':'"production"',__DEV__:'false'},plugins:[{name:'native-png',setup(b){b.onLoad({filter:/\.png$/},args=>({contents:'module.exports = '+JSON.stringify('data:image/png;base64,'+readFileSync(args.path).toString('base64')),loader:'js'}));}}]});
writeFileSync(resolve(out,'index.html'),'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Two bottle component preview</title><style>html,body,#root{margin:0;min-height:100%;background:#0b0a09}#root{display:flex;min-height:100vh}</style><div id="root"></div><script src="preview.js"></script></html>');
console.log(out);
