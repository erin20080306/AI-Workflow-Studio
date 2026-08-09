// A single, fixed, platform-authored shopping-cart script for generated
// storefronts. It is NEVER assembled from AI or user content, contains no
// network calls, no eval, and no inline event handlers, and is allow-listed in
// the public/preview CSP by its SHA-256 so that only this exact script can run.
// If you edit WEBSITE_CART_SCRIPT, recompute WEBSITE_CART_SCRIPT_SHA256
// (a guard test in website-cart.test.ts fails until you do).

export const WEBSITE_CART_SCRIPT = `(function(){
var root=document.querySelector('[data-cart-root]');
if(!root)return;
var key='aiws-cart:'+(root.getAttribute('data-cart-key')||location.pathname);
var currency=root.getAttribute('data-cart-currency')||'';
var labels={remove:root.getAttribute('data-cart-remove')||'Remove'};
function read(){try{var v=JSON.parse(localStorage.getItem(key));return Array.isArray(v)?v:[]}catch(e){return[]}}
function write(c){try{localStorage.setItem(key,JSON.stringify(c))}catch(e){}}
var cart=read();
function money(n){return currency+n.toLocaleString()}
function count(){var t=0;for(var i=0;i<cart.length;i++)t+=cart[i].qty;return t}
function subtotal(){var t=0;for(var i=0;i<cart.length;i++)t+=(cart[i].price||0)*cart[i].qty;return t}
function find(id){for(var i=0;i<cart.length;i++)if(cart[i].id===id)return cart[i];return null}
function render(){
var badges=document.querySelectorAll('[data-cart-count]');var n=count();
for(var b=0;b<badges.length;b++){badges[b].textContent=String(n);badges[b].setAttribute('data-empty',n===0?'true':'false')}
var list=root.querySelector('[data-cart-items]');var empty=root.querySelector('[data-cart-empty]');
if(!list)return;
list.textContent='';
if(cart.length===0){if(empty)empty.hidden=false}else{if(empty)empty.hidden=true}
for(var i=0;i<cart.length;i++){(function(item){
var row=document.createElement('div');row.className='cart-line';
var info=document.createElement('div');info.className='cart-line-info';
var name=document.createElement('div');name.className='cart-line-name';name.textContent=item.name;info.appendChild(name);
if(item.variant){var v=document.createElement('div');v.className='cart-line-variant';v.textContent=item.variant;info.appendChild(v)}
var price=document.createElement('div');price.className='cart-line-price';price.textContent=item.price?money(item.price):'';info.appendChild(price);
row.appendChild(info);
var qty=document.createElement('div');qty.className='cart-qty';
var dec=document.createElement('button');dec.type='button';dec.className='cart-qty-btn';dec.textContent='−';dec.setAttribute('aria-label','-');
var num=document.createElement('span');num.className='cart-qty-num';num.textContent=String(item.qty);
var inc=document.createElement('button');inc.type='button';inc.className='cart-qty-btn';inc.textContent='+';inc.setAttribute('aria-label','+');
dec.addEventListener('click',function(){change(item.id,-1)});
inc.addEventListener('click',function(){change(item.id,1)});
qty.appendChild(dec);qty.appendChild(num);qty.appendChild(inc);row.appendChild(qty);
var rm=document.createElement('button');rm.type='button';rm.className='cart-remove';rm.textContent=labels.remove;
rm.addEventListener('click',function(){remove(item.id)});row.appendChild(rm);
list.appendChild(row)})(cart[i])}
var sub=root.querySelector('[data-cart-subtotal]');if(sub)sub.textContent=money(subtotal())}
function add(p){var e=find(p.id);if(e){e.qty++}else{cart.push({id:p.id,name:p.name,price:p.price,currency:p.currency,variant:p.variant,qty:1})}write(cart);render();open()}
function change(id,d){var e=find(id);if(!e)return;e.qty+=d;if(e.qty<=0){remove(id);return}write(cart);render()}
function remove(id){cart=cart.filter(function(x){return x.id!==id});write(cart);render()}
function open(){root.setAttribute('data-cart-open','true')}
function close(){root.removeAttribute('data-cart-open')}
var adders=document.querySelectorAll('[data-add-cart]');
for(var a=0;a<adders.length;a++){(function(btn){btn.addEventListener('click',function(){
var price=parseFloat(btn.getAttribute('data-price'));
add({id:btn.getAttribute('data-id'),name:btn.getAttribute('data-name'),price:isNaN(price)?0:price,currency:btn.getAttribute('data-currency')||'',variant:btn.getAttribute('data-variant')||''})})})(adders[a])}
var togglers=document.querySelectorAll('[data-cart-toggle]');
for(var t=0;t<togglers.length;t++)togglers[t].addEventListener('click',open);
var closers=root.querySelectorAll('[data-cart-close]');
for(var c=0;c<closers.length;c++)closers[c].addEventListener('click',close);
document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});
render()})();`;

// SHA-256 of WEBSITE_CART_SCRIPT, in CSP source-expression form. Guarded by a
// test so it cannot drift from the script above.
export const WEBSITE_CART_SCRIPT_SHA256 = 'sha256-EFxf1nyyk3zsZQedf7Bs+McfWJ/2LsbmHYhw4UBb5us=';
