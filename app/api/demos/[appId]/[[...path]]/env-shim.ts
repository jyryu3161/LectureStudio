/**
 * Client-side environment shim SOURCE (a string, executed in the browser — never
 * on the server) shared by the demo proxy's HTML prelude and its Worker
 * bootstrap. See route.ts's docblock for why the sandbox needs it.
 *
 * A sandboxed iframe without `allow-same-origin` has an opaque origin, which
 * makes `localStorage`, `sessionStorage` AND `indexedDB` throw a SecurityError
 * on access. marimo touches localStorage during its first render and mounts an
 * IndexedDB-backed Pyodide filesystem (emscripten IDBFS) in its worker, so both
 * an uncaught storage read and a failed FS sync otherwise abort the demo. When
 * (and only when) the native storage throws, this installs harmless in-memory
 * replacements: ephemeral, per-context, shared with nothing — it removes a crash
 * without granting the untrusted demo any real persistence or cross-origin
 * reach. The IndexedDB stub implements exactly the surface emscripten's IDBFS
 * uses (open/upgradeneeded, createObjectStore/createIndex, transaction/
 * objectStore/index, get/put/delete/openKeyCursor).
 *
 * It runs in both a Window (prelude) and a DedicatedWorkerGlobalScope (worker),
 * so it references `self` rather than `window`.
 */
export const ENV_SHIM_SOURCE = `(function(){
var G=self;
function async(fn){setTimeout(fn,0);}
var sandboxed=false;
try{var probe=G.localStorage;probe.getItem('');}catch(e){sandboxed=true;}
if(!sandboxed)return;
function memStorage(){var m=Object.create(null);return{
getItem:function(k){k=String(k);return k in m?m[k]:null;},
setItem:function(k,v){m[String(k)]=String(v);},
removeItem:function(k){delete m[String(k)];},
clear:function(){for(var k in m)delete m[k];},
key:function(i){var s=Object.keys(m);return i>=0&&i<s.length?s[i]:null;},
get length(){return Object.keys(m).length;}};}
['localStorage','sessionStorage'].forEach(function(n){
try{Object.defineProperty(G,n,{configurable:true,value:memStorage()});}catch(e){}});
function req(){return{onsuccess:null,onerror:null,onupgradeneeded:null,result:undefined,error:null,transaction:null};}
function ok(r,result){r.result=result;async(function(){if(r.onsuccess)r.onsuccess({target:r});});return r;}
function Index(store){this.store=store;}
Index.prototype.openKeyCursor=function(){
var r=req(),keys=Array.from(this.store.m.keys()),i=0,store=this.store;
function step(){
if(i>=keys.length){r.result=null;if(r.onsuccess)r.onsuccess({target:r});return;}
var k=keys[i++];
r.result={primaryKey:k,key:store.m.get(k)&&store.m.get(k).timestamp,continue:function(){async(step);}};
if(r.onsuccess)r.onsuccess({target:r});}
async(step);return r;};
Index.prototype.openCursor=Index.prototype.openKeyCursor;
function Store(name){this.name=name;this.m=new Map();this._indexes={};this.indexNames={contains:function(n){return n in this._indexes;}.bind(this)};}
Store.prototype.createIndex=function(n){this._indexes[n]=true;return new Index(this);};
Store.prototype.index=function(){return new Index(this);};
Store.prototype.get=function(k){return ok(req(),this.m.has(k)?this.m.get(k):undefined);};
Store.prototype.put=function(v,k){this.m.set(k,v);return ok(req(),k);};
Store.prototype.delete=function(k){this.m.delete(k);return ok(req(),undefined);};
Store.prototype.clear=function(){this.m.clear();return ok(req(),undefined);};
Store.prototype.count=function(){return ok(req(),this.m.size);};
Store.prototype.openCursor=function(){
var r=req(),keys=Array.from(this.m.keys()),i=0,self2=this;
function step(){
if(i>=keys.length){r.result=null;if(r.onsuccess)r.onsuccess({target:r});return;}
var k=keys[i++];
r.result={key:k,primaryKey:k,value:self2.m.get(k),continue:function(){async(step);}};
if(r.onsuccess)r.onsuccess({target:r});}
async(step);return r;};
function Tx(db){this.db=db;this.onerror=null;this.oncomplete=null;this.onabort=null;}
Tx.prototype.objectStore=function(n){return this.db._stores[n]||(this.db._stores[n]=new Store(n));};
function DB(name){this.name=name;this._stores={};this.objectStoreNames={contains:function(n){return n in this._stores;}.bind(this)};}
DB.prototype.createObjectStore=function(n){return this._stores[n]=new Store(n);};
DB.prototype.transaction=function(){return new Tx(this);};
DB.prototype.close=function(){};
var DBS=Object.create(null);
var factory={
open:function(name){
var r=req(),fresh=!DBS[name],db=DBS[name]||(DBS[name]=new DB(name));
async(function(){
r.result=db;
if(fresh&&r.onupgradeneeded){
r.transaction={objectStore:function(n){return db._stores[n];}};
r.onupgradeneeded({target:{result:db,transaction:r.transaction}});}
if(r.onsuccess)r.onsuccess({target:r});});
return r;},
deleteDatabase:function(name){var r=req();delete DBS[name];return ok(r,undefined);},
cmp:function(a,b){return a<b?-1:a>b?1:0;}};
try{Object.defineProperty(G,'indexedDB',{configurable:true,value:factory});}catch(e){}
})();`;
