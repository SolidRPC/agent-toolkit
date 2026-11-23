const onboarding = await fetch('https://api.solidrpc.io/agent/v1/onboarding', { redirect: 'error' });
if (!onboarding.ok) throw new Error(`Onboarding returned HTTP ${onboarding.status}`);
const { payPerRequest } = await onboarding.json();
if (payPerRequest?.scheme !== 'batch-settlement') {
  throw new Error('Onboarding does not advertise x402 batch settlement');
}

const capabilitiesResponse = await fetch(payPerRequest.capabilities, { redirect: 'error' });
if (!capabilitiesResponse.ok) throw new Error(`Capabilities returned HTTP ${capabilitiesResponse.status}`);
const { asset, paymentNetwork, priceUnit } = await capabilitiesResponse.json();
if (priceUnit !== '0.000001 USDC') throw new Error('Expected capabilities to price calls in millionths of USDC');

const response = await fetch(payPerRequest.rpc.replace('{chainId}', '8453'), {
  method: 'POST',
  redirect: 'error',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] }),
});
if (response.status !== 402) throw new Error(`Expected a free HTTP 402 quote, received HTTP ${response.status}`);

const { accepts, quote } = await response.json();
const offer = accepts?.find(offer => offer.scheme === 'batch-settlement');
if (!offer) throw new Error('Missing batch-settlement offer');
if (typeof asset !== 'string' || !/^0x[0-9a-f]{40}$/i.test(asset) ||
    typeof offer.asset !== 'string' || offer.asset.toLowerCase() !== asset.toLowerCase()) {
  throw new Error('Quote asset does not match live capabilities');
}
if (!paymentNetwork || typeof paymentNetwork !== 'string' || offer.network !== paymentNetwork) {
  throw new Error('Quote payment network does not match live capabilities');
}
const expiry = Date.parse(quote?.expiresAt);
if (!Number.isFinite(expiry)) throw new Error('Missing or invalid quote expiry');
if (expiry <= Date.now()) throw new Error('Quote has expired');
if (typeof offer.amount !== 'string' || !/^\d+$/.test(offer.amount)) {
  throw new Error('Expected the price in integer millionths of USDC');
}
const digits = offer.amount.padStart(7, '0');
console.log(JSON.stringify({
  httpStatus: response.status,
  scheme: offer.scheme,
  paymentNetwork: offer.network,
  expiresAt: quote.expiresAt,
  amountMillionths: offer.amount,
  priceUSDC: `${digits.slice(0, -6)}.${digits.slice(-6)}`,
}, null, 2));
