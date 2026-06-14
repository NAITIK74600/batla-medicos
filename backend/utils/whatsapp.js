'use strict';
/**
 * WhatsApp notification helper — powered by Twilio WhatsApp API.
 *
 * Setup:
 *  1. Sign up at https://console.twilio.com and note ACCOUNT_SID + AUTH_TOKEN.
 *  2. For development/testing, enable the Twilio Sandbox for WhatsApp:
 *       https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
 *     Each customer must opt-in by sending "join <sandbox-keyword>" to
 *     the sandbox number (+1 415 523 8886) before receiving messages.
 *  3. For production, register a WhatsApp Business number in Twilio and
 *     get message templates approved by Meta.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID   — from Twilio Console
 *   TWILIO_AUTH_TOKEN    — from Twilio Console
 *   TWILIO_WHATSAPP_FROM — e.g. "whatsapp:+14155238886" (sandbox)
 *                          or   "whatsapp:+91XXXXXXXXXX" (production)
 *   SHOP_URL             — base URL for tracking links (default: https://batlamedicos.shop)
 */

let twilioClient = null;

function getClient() {
  if (twilioClient) return twilioClient;
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.startsWith('ACxxx')) return null;
  try {
    // eslint-disable-next-line global-require
    twilioClient = require('twilio')(sid, token);
  } catch {
    console.warn('[WhatsApp] twilio package not available.');
  }
  return twilioClient;
}

const FROM      = () => process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const SHOP_URL  = () => (process.env.SHOP_URL || 'https://batlamedicos.shop').replace(/\/$/, '');
const SHOP_NAME = 'Batla Medicos';
const SHOP_PHONE = '+91 99901 65925';

/**
 * Normalise a 10-digit Indian phone number to WhatsApp E.164 format.
 * Accepts: "9990165925", "09990165925", "+919990165925"
 */
function toWaNumber(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `whatsapp:+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `whatsapp:+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `whatsapp:+91${digits.slice(1)}`;
  return null; // unrecognised format — skip
}

/**
 * Core send — never throws; logs errors instead.
 */
async function sendWA(phone, body) {
  const client = getClient();
  if (!client) {
    console.log(`[WhatsApp] Not configured. Would send to ${phone}:\n${body}`);
    return;
  }
  const to = toWaNumber(phone);
  if (!to) {
    console.warn(`[WhatsApp] Invalid phone "${phone}", skipping.`);
    return;
  }
  try {
    const msg = await client.messages.create({ from: FROM(), to, body });
    console.log(`[WhatsApp] Sent to ${to} — SID: ${msg.sid}`);
  } catch (err) {
    // Non-fatal: WhatsApp failure must not break order flow
    console.error(`[WhatsApp] Send failed to ${to}:`, err.message);
  }
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Notify customer when their order is placed.
 */
async function notifyOrderPlaced(order, userName) {
  const phone = order.address?.phone;
  if (!phone) return;

  const invoiceNo  = `BM-${order._id.toString().slice(-8).toUpperCase()}`;
  const typeLabel  = order.deliveryType === 'takeaway'
    ? `🏪 Store Pickup — Slot: ${order.takeawaySlot || 'ASAP'}`
    : `🚚 Home Delivery`;
  const trackUrl   = `${SHOP_URL()}/orders/${order._id}`;

  await sendWA(phone,
    `Hello ${userName || 'Customer'}! 👋\n\n` +
    `✅ *Order Placed Successfully!*\n` +
    `Order ID: *${invoiceNo}*\n` +
    `Amount: *₹${order.total.toFixed(2)}*\n` +
    `${typeLabel}\n\n` +
    `🔗 Track your order: ${trackUrl}\n\n` +
    `Thank you for shopping with *${SHOP_NAME}* 💊`
  );
}

/**
 * Notify customer when order status changes.
 */
async function notifyOrderStatus(order, status, userName) {
  const phone = order.address?.phone;
  if (!phone) return;

  const invoiceNo = `BM-${order._id.toString().slice(-8).toUpperCase()}`;
  const trackUrl  = `${SHOP_URL()}/orders/${order._id}`;
  const name      = userName || 'Customer';

  const isTakeaway = order.deliveryType === 'takeaway';

  const messages = {
    confirmed: `Hello ${name}! 📦\n\n*Order Confirmed!*\nOrder *${invoiceNo}* is confirmed and being ${isTakeaway ? 'prepared for pickup' : 'prepared for dispatch'}.\n\n🔗 Track: ${trackUrl}\n—${SHOP_NAME} 💊`,

    dispatched: isTakeaway
      ? `Hello ${name}! 🏪\n\n*Ready for Pickup!*\nOrder *${invoiceNo}* is ready. Please collect it at:\n📍 F 41/2 Nafees Road, Batla House, Jamia Nagar, New Delhi-110025\n📞 ${SHOP_PHONE}\n\n🔗 View order: ${trackUrl}\n—${SHOP_NAME} 💊`
      : `Hello ${name}! 🚚\n\n*Order Dispatched!*\nOrder *${invoiceNo}* is on its way to you!\n\n🔗 Track: ${trackUrl}\n—${SHOP_NAME} 💊`,

    delivered: isTakeaway
      ? `Hello ${name}! 🎉\n\n*Pickup Complete!*\nOrder *${invoiceNo}* marked as collected. Thank you!\n\n⭐ We'd love your feedback. Shop again: ${SHOP_URL()}\n—${SHOP_NAME} 💊`
      : `Hello ${name}! 🎉\n\n*Order Delivered!*\nOrder *${invoiceNo}* has been delivered. Enjoy your medicines!\n\n⭐ Thank you for choosing ${SHOP_NAME}. Shop again: ${SHOP_URL()}\n💊`,

    cancelled: `Hello ${name}! ❌\n\n*Order Cancelled*\nOrder *${invoiceNo}* has been cancelled.\n\nFor queries, call us: ${SHOP_PHONE}\n\n—${SHOP_NAME} 💊`,
  };

  if (messages[status]) await sendWA(phone, messages[status]);
}

module.exports = { notifyOrderPlaced, notifyOrderStatus };
