const crypto = require('crypto');

/**
 * Verify a Razorpay webhook signature.
 * @param {string} rawBody - Raw request body string
 * @param {string} signature - x-razorpay-signature header value
 * @returns {boolean}
 */
const verifyRazorpayWebhook = (rawBody, signature) => {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(rawBody)
    .digest('hex');
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(signature, 'hex')
  );
};

module.exports = { verifyRazorpayWebhook };
