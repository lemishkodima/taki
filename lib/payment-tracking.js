const { createHmac, createHash, timingSafeEqual } = require('node:crypto');

const PIXEL_ID = '1415065917256078';
const SIGNED_FIELDS = ['merchantAccount', 'orderReference', 'amount', 'currency', 'authCode', 'cardPan', 'transactionStatus', 'reasonCode'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const sign = (values, secret) => createHmac('md5', secret).update(values.join(';'), 'utf8').digest('hex');

function validSignature(payment, env) {
  if (!payment || Array.isArray(payment) || typeof payment !== 'object') return false;
  if (payment.merchantAccount !== env.WAYFORPAY_MERCHANT_ACCOUNT) return false;
  if (!SIGNED_FIELDS.every(key => ['string', 'number'].includes(typeof payment[key]) && String(payment[key]).length <= 512)) return false;
  if (typeof payment.merchantSignature !== 'string' || !/^[a-f0-9]{32}$/i.test(payment.merchantSignature)) return false;
  const expected = sign(SIGNED_FIELDS.map(key => payment[key]), env.WAYFORPAY_SECRET_KEY);
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(payment.merchantSignature, 'hex'));
}

function acknowledgement(payment, secret, now) {
  const time = Math.floor(now / 1000);
  return { orderReference:payment.orderReference, status:'accept', time,
    signature:sign([payment.orderReference, 'accept', time], secret) };
}

function purchaseEvent(payment, now) {
  if (!payment.orderReference || !/^\d+(\.\d{1,2})?$/.test(String(payment.amount))) throw new Error('invalid_amount');
  const value = Number(payment.amount);
  if (!Number.isFinite(value) || value <= 0 || payment.currency !== 'UAH') throw new Error('invalid_currency_or_amount');
  const eventTime = Number(payment.processingDate);
  if (!Number.isInteger(eventTime) || eventTime <= 0 || eventTime > now / 1000 + 300 || eventTime < now / 1000 - 7 * 86400) throw new Error('invalid_payment_time');
  const userData = {};
  const email = typeof payment.email === 'string' ? payment.email.trim().toLowerCase() : '';
  let phone = typeof payment.phone === 'string' ? payment.phone.replace(/\D/g, '') : '';
  if (/^0\d{9}$/.test(phone)) phone = `38${phone}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) userData.em = [sha256(email)];
  if (/^[1-9]\d{8,14}$/.test(phone)) userData.ph = [sha256(phone)];
  if (!Object.keys(userData).length) throw new Error('missing_payer_contact');
  return {
    event_name:'Purchase', event_time:eventTime,
    event_id:`wfp_${sha256(`${payment.merchantAccount}:${payment.orderReference}`)}`,
    action_source:'website', event_source_url:'https://www.taki.org.ua/',
    user_data:userData, custom_data:{ value, currency:'UAH' }
  };
}

function createHandler({ env = process.env, fetchImpl = fetch, now = Date.now, log = console.error } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error:'method_not_allowed' });
    }
    if (!env.WAYFORPAY_MERCHANT_ACCOUNT || !env.WAYFORPAY_SECRET_KEY) return res.status(503).json({ error:'tracking_not_configured' });
    let payment;
    try {
      let body = req.body;
      if (Buffer.isBuffer(body)) body = body.toString('utf8');
      // WayForPay may post raw JSON using a form content type.
      if (body && typeof body === 'object' && Object.keys(body).length === 1) {
        const key = Object.keys(body)[0];
        if (key.startsWith('{') && body[key] === '') body = key;
      }
      payment = typeof body === 'string' ? JSON.parse(body) : body;
    } catch (_) { return res.status(400).json({ error:'invalid_json' }); }
    if (!validSignature(payment, env)) return res.status(401).json({ error:'invalid_signature' });
    const accept = () => res.status(200).json(acknowledgement(payment, env.WAYFORPAY_SECRET_KEY, now()));
    // Holds, pending, declined, refunded and all other statuses are not purchases.
    if (payment.transactionStatus !== 'Approved' || String(payment.reasonCode) !== '1100') return accept();
    const testMode = env.TRACKING_MODE === 'test';
    if ((testMode && (!env.META_TEST_EVENT_CODE || env.VERCEL_ENV === 'production')) ||
        (!testMode && (env.META_TEST_EVENT_CODE || /^test_/i.test(payment.merchantAccount)))) {
      return res.status(503).json({ error:'invalid_tracking_mode' });
    }
    if (!env.META_CAPI_ACCESS_TOKEN) {
      return res.status(503).json({ error:'tracking_not_configured' });
    }
    try {
      // Stateless delivery: every retry has the same order-derived event_id and
      // original processingDate. Meta handles deduplication within its window.
      // Late callbacks may be counted again; no persistent delivery ledger exists.
      const event = purchaseEvent(payment, now());
      const payload = { data:[event] };
      if (testMode) payload.test_event_code = env.META_TEST_EVENT_CODE;
      const version = env.META_GRAPH_API_VERSION || 'v25.0';
      if (!/^v\d+\.0$/.test(version)) throw new Error('invalid_meta_api_version');
      const response = await fetchImpl(`https://graph.facebook.com/${version}/${PIXEL_ID}/events`, {
        method:'POST', headers:{ Authorization:`Bearer ${env.META_CAPI_ACCESS_TOKEN}`, 'Content-Type':'application/json' },
        body:JSON.stringify(payload), signal:AbortSignal.timeout(10000)
      });
      const result = await response.json();
      if (!response.ok || result.events_received !== 1) throw new Error('meta_delivery_failed');
      return accept();
    } catch (error) {
      // Never log callbacks, card data, contacts or API response bodies/tokens.
      const safeCodes = ['invalid_amount','invalid_currency_or_amount','invalid_payment_time','missing_payer_contact','invalid_meta_api_version','meta_delivery_failed'];
      log('Payment tracking:', safeCodes.includes(error.message) ? error.message : 'delivery_failed');
      return res.status(503).json({ error:'tracking_delivery_pending' });
    }
  };
}

module.exports = { createHandler, validSignature, purchaseEvent, acknowledgement };
