const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../checkout-tracking.js'),'utf8');
function setup({valid=true,fbq=true}={}) {
  let listener, pageshow, submitted=0;
  const calls=[], timers=[];
  const form={action:'https://secure.wayforpay.com/payment/www.taki.org.ua',checkValidity:()=>valid,addEventListener:(_,fn)=>{listener=fn;}};
  const window={setTimeout:fn=>timers.push(fn),addEventListener:(_,fn)=>{pageshow=fn;}};
  if(fbq)window.fbq=(...args)=>calls.push(args);
  vm.runInNewContext(code,{document:{querySelectorAll:()=>[form]},window,location:{href:'https://www.taki.org.ua/'},URL,HTMLFormElement:{prototype:{submit(){submitted++;}}}});
  return {calls,fire:()=>listener({defaultPrevented:false,preventDefault(){}}),flush:()=>timers.splice(0).forEach(fn=>fn()),pageshow:()=>pageshow(),submitted:()=>submitted};
}
test('valid submit tracks once and proceeds to payment; return allows next checkout',()=>{
  const f=setup(); f.fire(); f.fire(); assert.equal(f.calls.length,1);
  assert.equal(f.calls[0][1],'InitiateCheckout'); assert.equal(f.calls[0][2].value,undefined);
  f.flush(); assert.equal(f.submitted(),1); f.pageshow(); f.fire(); assert.equal(f.calls.length,2);
});
test('unchecked required consent cannot track or navigate',()=>{
  const f=setup({valid:false});f.fire();f.flush();assert.equal(f.calls.length,0);assert.equal(f.submitted(),0);
});
test('missing Pixel never blocks payment',()=>{
  const f=setup({fbq:false});f.fire();f.flush();assert.equal(f.submitted(),1);
});
