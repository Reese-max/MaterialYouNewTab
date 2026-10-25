'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=[];const document={activeElement:null,createElement(tag){const n={tag,children:[],events:{},setAttribute(){},append(...items){this.children.push(...items)},addEventListener(type,fn){this.events[type]=fn},focus(){document.activeElement=this},showModal(){},remove(){this.removed=true}};nodes.push(n);return n},body:{append(){}},contains:n=>nodes.includes(n)};
const window={};vm.runInNewContext(fs.readFileSync('scripts/mynt-dialog.js','utf8'),{window,document,localStorage:{getItem:()=> 'en'}});
(async()=>{
 const previous=document.createElement('button');previous.focus();
 const pending=window.myntDialog.confirm('Synthetic fixture only',{danger:true,focusCancel:true,okText:'Permanently delete'});
 const dialog=nodes.find(n=>n.tag==='dialog'),cancel=nodes.find(n=>n.value==='cancel'),ok=nodes.find(n=>n.value==='ok');
 assert.equal(document.activeElement,cancel);assert.equal(ok.className,'myntAppDialogOk is-danger');
 let prevented=0;dialog.events.keydown({key:'Enter',target:dialog,preventDefault(){prevented++}});assert.equal(prevented,1);assert.equal(document.activeElement,cancel);
 dialog.events.keydown({key:'Enter',target:ok,preventDefault(){throw Error('Explicit confirmation must remain usable')}});
 dialog.events.cancel();dialog.events.close();assert.equal(await pending,false);assert.equal(document.activeElement,previous);
 const normal=window.myntDialog.confirm('Ordinary confirmation');const lastDialog=nodes.filter(n=>n.tag==='dialog').at(-1);assert.equal(document.activeElement.value,'ok','Ordinary existing dialogs retain behavior');lastDialog.returnValue='ok';lastDialog.events.close();assert.equal(await normal,true);
 console.log('PURGE_DIALOG_OK: cancel-first focus, no implicit irreversible Enter, explicit confirmation and ordinary-dialog compatibility');
})().catch(e=>{console.error(e);process.exitCode=1;});
