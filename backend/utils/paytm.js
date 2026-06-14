function isPlaceholder(value, placeholder) {
  return !value || value === placeholder;
}

function isPaytmConfigured() {
  return !isPlaceholder(process.env.PAYTM_MID, 'your_paytm_mid')
    && !isPlaceholder(process.env.PAYTM_MERCHANT_KEY, 'your_paytm_merchant_key')
    && !isPlaceholder(process.env.PAYTM_WEBSITE, 'WEBSTAGING');
}

function getPaytmConfig() {
  return {
    enabled: isPaytmConfigured(),
    mid: process.env.PAYTM_MID || '',
    website: process.env.PAYTM_WEBSITE || 'WEBSTAGING',
    environment: process.env.PAYTM_ENV || 'staging',
    callbackUrl: process.env.PAYTM_CALLBACK_URL || '',
  };
}

module.exports = { isPaytmConfigured, getPaytmConfig };