import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
const root=path.resolve(__dirname,'../..');
const parse=(relative:string)=>ts.createSourceFile(relative,fs.readFileSync(path.join(root,relative),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function walk(node:ts.Node,visit:(node:ts.Node)=>void){visit(node);ts.forEachChild(node,child=>walk(child,visit));}
test('Bottle Check static modal options belong to its layout and cannot call page setOptions each render',()=>{
 const page=parse('app/(app)/bottle-check.tsx');const dynamic:ts.Node[]=[];
 walk(page,node=>{if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(page)==='Stack.Screen')dynamic.push(node);});
 assert.equal(dynamic.length,0,'page-level Screen triggers Expo layout-effect option writes');
 const layout=parse('app/(app)/_layout.tsx');let options='';
 walk(layout,node=>{if(!ts.isJsxSelfClosingElement(node)||node.tagName.getText(layout)!=='Stack.Screen')return;
 const attrs=node.attributes.properties;const name=attrs.find(a=>ts.isJsxAttribute(a)&&a.name.getText(layout)==='name');
 if(name&&ts.isJsxAttribute(name)&&name.initializer&&ts.isStringLiteral(name.initializer)&&name.initializer.text==='bottle-check')options=node.getText(layout);
 });
 assert.match(options,/presentation:\s*"modal"/);assert.match(options,/headerShown:\s*false/,'custom header must retain layout ownership');
});
