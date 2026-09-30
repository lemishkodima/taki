const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createHandler } = require('../lib/payment-tracking');
const timestamp = Date.parse('2026-10-02T10:00:00Z');
const env = {
  WAYFORPAY_MERCHANT_ACCOUNT:'fixture_merchant', WAYFORPAY_SECRET_KEY:'fixture-secret',
  META_CAPI_ACCESS_TOKEN:'fixture-token', TRACKING_MODE:'live'
};
function payment(overrides = {}) {
  const p = { merchantAccount:env.WAYFORPAY_MERCHANT_ACCOUNT, orderReference:'fixture-order',
    amount:5600, currency:'UAH', authCode:'fixture', cardPan:'41****8217',
    transactionStatus:'Approved', reasonCode:1100, processingDate:timestamp / 1000,
    email:' Buyer@example.com ', phone:'+380 (73) 118-95-62', ...overrides };
  p.merchantSignature = createHmac('md5', env.WAYFORPAY_SECRET_KEY)
    .update(['merchantAccount','orderReference','amount','currency','authCode','cardPan','transactionStatus','reasonCode'].map(k => p[k]).join(';')).digest('hex');
  return p;
}
function fixture(config = {}) {
  const events = [];
  let failMeta = false, clock = timestamp;
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.startsWith('https://graph.facebook.com/')) {
      events.push(body);
      assert.equal(options.headers.Authorization, 'Bearer fixture-token');
      return { ok:!failMeta, json:async () => failMeta ? {error:{}} : {events_received:1} };
    }
    throw new Error('Unexpected non-Meta network request');
  };
  const handler = createHandler({ env:{...env,...config}, fetchImpl, now:() => clock, log:() => {} });
  const call = async (body = payment(), method = 'POST') => {
    const res = { headers:{}, setHeader(k,v) { this.headers[k]=v; }, status(v) {this.statusCode=v;return this;}, json(v) {this.body=v;return this;} };
    await handler({method,body}, res); return res;
  };
  return {call,events,setFailMeta:v=>{failMeta=v;},setClock:v=>{clock=v;}};
}
test('Approved sends actual multi-ticket total, UAH, hashed contacts and signed acknowledgement', async () => {
  const f=fixture(), r=await f.call();
  assert.equal(r.statusCode,200); assert.equal(r.body.status,'accept');
  assert.deepEqual(f.events[0].data[0].custom_data,{value:5600,currency:'UAH'});
  assert.equal(f.events[0].data[0].event_name,'Purchase');
  assert.match(f.events[0].data[0].user_data.em[0],/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(f.events).includes('Buyer@example'));
  assert.equal(r.body.signature,createHmac('md5',env.WAYFORPAY_SECRET_KEY).update(`${r.body.orderReference};accept;${r.body.time}`).digest('hex'));
});
test('amount is not tied to website rates; raw JSON callback accepted', async()=>{
  const f=fixture(); await f.call(JSON.stringify(payment({amount:'1234.56'})));
  assert.equal(f.events[0].data[0].custom_data.value,1234.56);
});
test('invalid signature, modified amount and other merchant never reach Meta', async()=>{
  const f=fixture();
  assert.equal((await f.call({...payment(),amount:1})).statusCode,401);
  assert.equal((await f.call({...payment(),merchantSignature:'bad'})).statusCode,401);
  assert.equal((await f.call({...payment(),merchantSignature:[payment().merchantSignature]})).statusCode,401);
  assert.equal((await f.call(payment({merchantAccount:'other'}))).statusCode,401);
  assert.equal(f.events.length,0);
});
test('Pending, hold, Declined, Refunded never send Purchase', async()=>{
  const f=fixture();
  for(const transactionStatus of ['Pending','WaitingAuthComplete','Declined','Refunded','InProcessing']) assert.equal((await f.call(payment({transactionStatus}))).statusCode,200);
  assert.equal(f.events.length,0);
});
test('GET and malformed payloads cannot trigger purchases', async()=>{
  const f=fixture();
  assert.equal((await f.call(null,'GET')).statusCode,405);
  assert.equal((await f.call('{')).statusCode,400);
  assert.equal((await f.call(null)).statusCode,401);
  assert.equal(f.events.length,0);
});
test('repeated and concurrent callbacks reuse the same ID and payment time without storage', async()=>{
  const f=fixture(); await f.call(); await Promise.all([f.call(),f.call()]);
  assert.equal(f.events.length,3);
  assert.equal(new Set(f.events.map(p=>p.data[0].event_id)).size,1);
  assert.equal(new Set(f.events.map(p=>p.data[0].event_time)).size,1);
});
test('fresh server instances derive the same ID; different orders derive different IDs', async()=>{
  const a=fixture(), b=fixture(); await a.call(); await b.call();
  assert.equal(a.events[0].data[0].event_id,b.events[0].data[0].event_id);
  await b.call(payment({orderReference:'another-order'}));
  assert.notEqual(b.events[0].data[0].event_id,b.events[1].data[0].event_id);
});
test('Meta failure is not acknowledged; retry preserves event ID and time', async()=>{
  const f=fixture(); f.setFailMeta(true);
  assert.equal((await f.call()).statusCode,503);
  f.setFailMeta(false); f.setClock(timestamp+60000);
  assert.equal((await f.call()).statusCode,200);
  assert.equal(f.events[0].data[0].event_id,f.events[1].data[0].event_id);
  assert.equal(f.events[0].data[0].event_time,f.events[1].data[0].event_time);
});
test('late callbacks still use original ID/time; local deduplication is not claimed', async()=>{
  const f=fixture(); await f.call(); f.setClock(timestamp+4*86400000);
  assert.equal((await f.call()).statusCode,200);
  assert.equal(f.events.length,2);
  assert.deepEqual(f.events[0].data[0],f.events[1].data[0]);
});
test('missing Meta token is not acknowledged and sends nothing', async()=>{
  const f=fixture({META_CAPI_ACCESS_TOKEN:''});
  assert.equal((await f.call()).statusCode,503); assert.equal(f.events.length,0);
});
test('invalid amount, currency, timestamp or missing payer cannot send Purchase', async()=>{
  const f=fixture();
  for(const overrides of [{amount:0},{amount:-1},{amount:'NaN'},{currency:'USD'},{processingDate:1},{processingDate:timestamp/1000+3600},{email:'',phone:''}]) {
    assert.equal((await f.call(payment(overrides))).statusCode,503);
  }
  assert.equal(f.events.length,0);
});
test('test event code is sent only in isolated test environment', async()=>{
  const f=fixture({TRACKING_MODE:'test',META_TEST_EVENT_CODE:'TEST123',VERCEL_ENV:'preview'});
  assert.equal((await f.call()).statusCode,200); assert.equal(f.events[0].test_event_code,'TEST123');
  assert.equal((await fixture({TRACKING_MODE:'test',META_TEST_EVENT_CODE:'TEST123',VERCEL_ENV:'production'}).call()).statusCode,503);
  assert.equal((await fixture({META_TEST_EVENT_CODE:'TEST123'}).call()).statusCode,503);
});
