'use strict';
/**
 * chat.js — MedBot chatbot endpoint
 * - With GEMINI_API_KEY: full AI responses via Gemini
 * - Without key: smart rule-based offline fallback (no API needed)
 * POST /api/chat  { message: string, history: [{role, text}] }
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const chatLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: 'Too many messages. Please wait a moment before sending more.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// OFFLINE RULE-BASED ENGINE
// ─────────────────────────────────────────────────────────────────────────────

const RULES = [
  // ── Greetings ──────────────────────────────────────────────────────────────
  {
    patterns: [/^(hi|hello|hey|namaste|namaskar|salaam|salam|hola|yo|sup)\b/i, /\b(good\s*(morning|afternoon|evening|night))\b/i],
    replies: [
      'Namaste! 👋 Welcome to Batla Medicos. How can I help you today?\n\nYou can ask me about medicines, store timings, home delivery, lab tests, or anything else!',
      'Hello! Welcome to Batla Medicos. 😊 I\'m MedBot, your pharmacy assistant. What can I help you with?',
    ],
  },
  // ── How are you ────────────────────────────────────────────────────────────
  {
    patterns: [/how are you|kaise ho|kaisa hai|aap kaisa/i],
    replies: ['I\'m doing great, thank you for asking! 😊 I\'m here to help you with medicines, lab tests, orders, and anything about Batla Medicos. What do you need?'],
  },
  // ── Thanks ─────────────────────────────────────────────────────────────────
  {
    patterns: [/\b(thank|thanks|thankyou|thank you|shukriya|dhanyawad|thx)\b/i],
    replies: [
      'You\'re most welcome! 😊 Is there anything else I can help you with?',
      'Happy to help! Feel free to ask if you need anything else. 🙏',
    ],
  },
  // ── Bye / end ──────────────────────────────────────────────────────────────
  {
    patterns: [/\b(bye|goodbye|good bye|alvida|take care|quit|exit)\b/i],
    replies: ['Thank you for visiting Batla Medicos! Stay healthy. 🙏 Feel free to chat anytime you need help.'],
  },
  // ── Store location / address ───────────────────────────────────────────────
  {
    patterns: [/\b(address|location|where|kahan|kha|direction|map|shop|store|dukan)\b/i],
    replies: [
      '📍 **Batla Medicos** is located at:\n**Batla House, New Delhi – 110025**\n(Jamia Nagar area)\n\nYou can find us on Google Maps by searching "Batla Medicos". We\'re easily accessible by metro — Jamia Millia Islamia Metro Station is nearby.',
    ],
  },
  // ── Timings / hours ────────────────────────────────────────────────────────
  {
    patterns: [/\b(timing|time|hours|open|close|kab|schedule|baje|खुलना|बंद)\b/i],
    replies: [
      '🕐 **Store Timings:**\n**Mon–Sun:** 9:00 AM – 11:45 PM\n\nWe are open all 7 days! For medicines, prescriptions, and urgent needs — you can also order online at batlamedicos.shop for home delivery! 🚚',
    ],
  },
  // ── Contact / phone ────────────────────────────────────────────────────────
  {
    patterns: [/\b(contact|phone|number|call|helpline|whatsapp|reach|connect|mob)\b/i],
    replies: [
      '📞 You can reach Batla Medicos at:\n**WhatsApp / Call:** +91 99901 65925\n**Website:** batlamedicos.shop\n\nOur team is available during store hours to help you.',
    ],
  },
  // ── Home delivery ──────────────────────────────────────────────────────────
  {
    patterns: [/\b(deliver|delivery|home delivery|ghar|ship|courier|doorstep|pickup|pick up)\b/i],
    replies: [
      '🚚 Yes! We offer **home delivery** for medicines and healthcare products.\n\n✅ Order online at batlamedicos.shop\n✅ We deliver within the local area\n✅ Same-day delivery available for most orders\n\nFor large orders or urgent medicines, WhatsApp us at +91 99901 65925.',
    ],
  },
  // ── Lab tests ──────────────────────────────────────────────────────────────
  {
    patterns: [/\b(lab|test|blood test|sample|report|pathology|thyroid|sugar|diabetes|cholesterol|haemoglobin|hemoglobin|CBC|urine|HbA1c)\b/i],
    replies: [
      '🔬 We offer **home sample collection** for various lab tests including:\n\n• Blood tests (CBC, thyroid, diabetes, cholesterol, HbA1c)\n• Urine analysis\n• Hormone panels\n• And many more!\n\n📌 Book your lab test on the **Lab Tests** page on our website, or WhatsApp us at +91 99901 65925 to schedule a home visit.',
    ],
  },
  // ── Prescription ───────────────────────────────────────────────────────────
  {
    patterns: [/\b(prescription|rx|doctor|parchee|parchi|medicine prescription|prescribed)\b/i],
    replies: [
      '📋 **Prescriptions:**\n\nYou can upload your prescription directly on batlamedicos.shop → "Prescriptions" section, and our pharmacist will prepare your medicines.\n\nFor controlled/Schedule H medicines, a valid doctor\'s prescription is required by law. 🏥\n\nIf you\'re unsure about a medicine, please consult your doctor first.',
    ],
  },
  // ── Medicine availability ──────────────────────────────────────────────────
  {
    patterns: [/\b(available|stock|milega|milta|hai kya|do you have|in stock|out of stock|medicine available)\b/i],
    replies: [
      '💊 You can search for any medicine on our website **batlamedicos.shop** to check availability.\n\nIf a medicine is not found, you can use the **"Request Availability"** form on the search results page and we\'ll try to arrange it for you!\n\nYou can also WhatsApp us at +91 99901 65925 to check stock directly.',
    ],
  },
  // ── Payment ────────────────────────────────────────────────────────────────
  {
    patterns: [/\b(pay|payment|upi|card|cash|online payment|paytm|gpay|razorpay|COD|cash on delivery)\b/i],
    replies: [
      '💳 We accept multiple payment methods:\n\n✅ **Cash on Delivery (COD)**\n✅ **UPI** (GPay, PhonePe, Paytm)\n✅ **Debit/Credit Card** (via Razorpay)\n✅ **Net Banking**\n\nAll online payments are 100% secure. 🔒',
    ],
  },
  // ── Discount / coupon / offers ─────────────────────────────────────────────
  {
    patterns: [/\b(discount|coupon|offer|promo|sale|cashback|deal|code|off)\b/i],
    replies: [
      '🎉 Check our **Offers** page on batlamedicos.shop for current deals and discounts!\n\nWe regularly have offers on:\n• Generic medicines\n• Healthcare products\n• Lab test packages\n\nYou can also apply **coupon codes** at checkout. Ask us on WhatsApp (+91 99901 65925) for any active promo codes!',
    ],
  },
  // ── Order status / tracking ────────────────────────────────────────────────
  {
    patterns: [/\b(order|my order|order status|track|tracking|where is my|kahan hai|dispatch)\b/i],
    replies: [
      '📦 To check your order status:\n\n1. Log in to **batlamedicos.shop**\n2. Go to **"My Orders"** section\n3. Click on your order to see the latest status\n\nYou\'ll also receive WhatsApp/email updates as your order progresses. For urgent queries, WhatsApp us at +91 99901 65925.',
    ],
  },
  // ── Return / refund ────────────────────────────────────────────────────────
  {
    patterns: [/\b(return|refund|exchange|replace|wrong medicine|damaged|wapas)\b/i],
    replies: [
      '↩️ **Returns & Refunds:**\n\nWe accept returns for:\n• Wrong item delivered\n• Damaged/expired products\n\nTo initiate a return, please contact us within **24 hours** of delivery:\n📞 WhatsApp: +91 99901 65925\n\nNote: Medicines cannot be returned once dispensed due to safety regulations, unless there was an error on our part.',
    ],
  },
  // ── Generic medicines / cheaper option ────────────────────────────────────
  {
    patterns: [/\b(generic|jan aushadhi|affordable|cheap|sasta|budget|low cost|cheaper)\b/i],
    replies: [
      '💊 **Generic Medicines:**\n\nYes, we stock generic equivalent medicines which have the same active ingredients as branded medicines but at a **much lower price**!\n\nSimply ask our pharmacist for a generic alternative to any branded medicine. You can also filter by price on our website.\n\n🏥 Generic medicines are approved by the government and equally effective.',
    ],
  },
  // ── Ayurvedic / herbal ────────────────────────────────────────────────────
  {
    patterns: [/\b(ayurved|ayurvedic|herbal|patanjali|dabur|himalaya|hamdard|unani|homeopathy|homeopathic)\b/i],
    replies: [
      '🌿 **Ayurvedic & Herbal Products:**\n\nYes! We stock a wide range of Ayurvedic and herbal medicines including popular brands like Patanjali, Dabur, Himalaya, Hamdard, and more.\n\nBrowse the **Ayurvedic Brands** section on our homepage or search on batlamedicos.shop.',
    ],
  },
  // ── Common health questions — fever ───────────────────────────────────────
  {
    patterns: [/\b(fever|bukhar|temperature|paracetamol|crocin|dolo|calpol)\b/i],
    replies: [
      '🌡️ For fever, **Paracetamol** (Crocin, Dolo 650, Calpol) is commonly used. The usual adult dose is 500mg–1000mg every 4–6 hours as needed.\n\n⚠️ **Important:** This is general information only. If fever persists more than 3 days, is above 103°F, or is accompanied by severe symptoms, please see a doctor immediately.\n\nWe have paracetamol available at our store and for home delivery!',
    ],
  },
  // ── Common health questions — cold/cough ──────────────────────────────────
  {
    patterns: [/\b(cold|cough|sardi|khansi|flu|viral|runny nose|nasal|congestion|throat)\b/i],
    replies: [
      '🤧 For common cold and cough, we have a range of OTC medicines available:\n\n• **Cough syrup:** Benadryl, Honitus, Alex\n• **Cold tablets:** Sinarest, D-Cold, Coldarin\n• **Antihistamines:** Cetirizine, Loratadine\n\n💡 Stay hydrated, rest well, and have warm fluids. If symptoms worsen or last more than a week, please consult a doctor.\n\n⚠️ This is general information — consult a pharmacist for the right choice for your symptoms.',
    ],
  },
  // ── Diabetes / sugar ──────────────────────────────────────────────────────
  {
    patterns: [/\b(diabetes|sugar|diabetic|metformin|insulin|glucometer|blood sugar|HbA1c|glucose)\b/i],
    replies: [
      '🩸 **Diabetes Care:**\n\nWe stock a complete range of diabetes products:\n• Medicines: Metformin, Glipizide, Januvia, and more\n• Insulin and syringes\n• Glucometers and test strips\n• Sugar-free supplements\n\n🔬 We also offer **HbA1c and blood sugar lab tests** with home sample collection.\n\n⚠️ Diabetes medicines require a doctor\'s prescription. Please consult your doctor for dosage adjustments.',
    ],
  },
  // ── BP / blood pressure ───────────────────────────────────────────────────
  {
    patterns: [/\b(blood pressure|BP|hypertension|amlodipine|telmisartan|losartan|bp tablet|bp medicine)\b/i],
    replies: [
      '❤️ **Blood Pressure Medicines:**\n\nWe stock all major BP medications (Amlodipine, Telmisartan, Losartan, Atenolol, etc.).\n\nThese require a **doctor\'s prescription**. Please don\'t skip or change your BP medicine dosage without consulting your doctor first.\n\n📊 We also have **BP monitors** available for home use. Ask at the counter!',
    ],
  },
  // ── Vitamin / supplements ─────────────────────────────────────────────────
  {
    patterns: [/\b(vitamin|supplement|multivitamin|calcium|zinc|iron|omega|fish oil|protein|whey|immunity)\b/i],
    replies: [
      '💪 **Vitamins & Supplements:**\n\nWe have a wide range available:\n• Vitamin C, D3, B12, B-Complex\n• Calcium + Vitamin D\n• Iron supplements\n• Omega-3 / Fish oil\n• Zinc and immunity boosters\n• Protein supplements\n\nMost vitamins and supplements are available without a prescription. Visit our store or order online at batlamedicos.shop!',
    ],
  },
  // ── Baby / child products ──────────────────────────────────────────────────
  {
    patterns: [/\b(baby|infant|child|kids|paediatric|bacche|bachi|diaper|pamper|formula|cerelac)\b/i],
    replies: [
      '👶 **Baby & Child Products:**\n\nWe stock a complete range of baby products:\n• Baby medicines and syrups\n• Diapers and baby wipes\n• Baby formula and cereal\n• Baby skincare products\n• Thermometers for infants\n\nFor children\'s medicines, always consult a paediatric doctor for correct dosage. 🏥 Visit us or order online!',
    ],
  },
  // ── Skincare / cosmetics ──────────────────────────────────────────────────
  {
    patterns: [/\b(skin|cream|lotion|sunscreen|moisturizer|acne|pimple|fairness|face wash|hair|shampoo|dandruff)\b/i],
    replies: [
      '✨ **Skincare & Personal Care:**\n\nWe have a great range of skincare and personal care products:\n• Sunscreen, moisturizers, face wash\n• Acne treatments (Benzoyl peroxide, Clindamycin)\n• Hair care (anti-dandruff, hair fall)\n• Brands: Himalaya, Neutrogena, Cetaphil, Sebamed\n\nBrowse online at batlamedicos.shop or visit our store!',
    ],
  },
  // ── Surgical / dressing ───────────────────────────────────────────────────
  {
    patterns: [/\b(bandage|dressing|surgical|cotton|gauze|antiseptic|wound|cut|betadine|savlon|micropore)\b/i],
    replies: [
      '🩹 **Surgical & First Aid:**\n\nWe stock all first aid and surgical supplies:\n• Bandages, gauze, surgical tape\n• Cotton rolls and dressings\n• Antiseptics (Betadine, Savlon, Dettol)\n• Syringes and gloves\n• Wound care products\n\nAll available at our store and for delivery!',
    ],
  },
  // ── How to order / website help ──────────────────────────────────────────
  {
    patterns: [/\b(how to order|order kaise|place order|register|account|login|sign up|website use|how does)\b/i],
    replies: [
      '🛒 **How to Order Online:**\n\n1. Visit **batlamedicos.shop**\n2. Browse or search for your medicines\n3. Add items to cart 🛒\n4. Login / Create account\n5. Enter delivery address\n6. Choose payment method & place order\n\n📦 Your medicines will be delivered to your door!\n\nNeed help? WhatsApp us at +91 99901 65925 and we\'ll guide you.',
    ],
  },
  // ── What medicines do you sell ───────────────────────────────────────────
  {
    patterns: [/\b(what.*medicine|medicine.*sell|sell what|products|kya bechte|kya milta|sab kuch|all medicine)\b/i],
    replies: [
      '💊 **What We Sell:**\n\nBatla Medicos is a full-service pharmacy stocking:\n\n• **Prescription medicines** (all categories)\n• **OTC medicines** (pain relief, cold, digestive, etc.)\n• **Ayurvedic & herbal** products\n• **Vitamins & supplements**\n• **Baby & child products**\n• **Skincare & cosmetics**\n• **Surgical & first aid supplies**\n• **Medical devices** (BP monitors, glucometers)\n\nSearch for any product at batlamedicos.shop!',
    ],
  },
  // ── Catch-all for anything unrecognised ──────────────────────────────────
  {
    patterns: [/.*/],
    replies: [
      'I\'m not sure I fully understood that. 😊 Here are some things I can help you with:\n\n• 📍 Store location & timings\n• 🚚 Home delivery\n• 💊 Medicine availability\n• 🔬 Lab tests\n• 📋 Prescription upload\n• 💳 Payment options\n• 📦 Order tracking\n\nOr call/WhatsApp us at **+91 99901 65925** and our team will help you directly!',
      'I didn\'t quite catch that. Could you rephrase your question? You can also:\n\n• WhatsApp us: **+91 99901 65925**\n• Visit: batlamedicos.shop\n• Come to our store at Batla House, New Delhi 110025\n\nHappy to assist with anything pharmacy-related! 💊',
    ],
  },
];

let _ruleReplyCounts = {};

function getRuleBasedReply(message) {
  const msg = message.toLowerCase();
  for (const rule of RULES) {
    if (rule.patterns.some(p => p.test(msg))) {
      // Rotate through replies for variety
      const key = rule.patterns[0].toString();
      _ruleReplyCounts[key] = ((_ruleReplyCounts[key] || 0) + 1) % rule.replies.length;
      return rule.replies[_ruleReplyCounts[key]];
    }
  }
  return RULES[RULES.length - 1].replies[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI AI PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are MedBot, a helpful and friendly pharmacy assistant for Batla Medicos — a trusted medical store located in Batla House, New Delhi (Jamia Nagar area, 110025).

You help customers with:
- Information about medicines, their common uses, general dosage guidance, and side effects
- Finding products and checking if something might be available at the store
- General health and wellness tips
- Information about lab tests and home sample collection services
- Guidance on when to seek a doctor's advice
- Order-related queries and store information

Always:
- Be warm, helpful, and concise (2–4 sentences unless more detail is genuinely needed)
- Recommend consulting a qualified doctor or pharmacist for specific prescriptions, serious symptoms, or treatment decisions
- Never prescribe medicines or give specific dosage for a patient's condition
- Respond in the same language the user writes in (Hindi or English — mix is fine)
- When unsure, say so honestly and suggest they call the store or visit in person

Store details:
- Name: Batla Medicos
- Location: Batla House, New Delhi – 110025
- Phone/WhatsApp: +91 99901 65925
- Services: Medicines, OTC products, lab tests, home delivery
- Website: batlamedicos.shop`;

// Use the shared model list (configurable via GEMINI_MODEL in backend/.env)
const { getGeminiModels } = require('../utils/gemini');

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', chatLimit, async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message is required.' });
    }

    const trimmed = message.trim().slice(0, 500);

    // ── Try Gemini AI first ──────────────────────────────────────────────────
    const { getGeminiKey } = require('../utils/gemini');
    const geminiKey = getGeminiKey();

    if (geminiKey) {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);

      const safeHistory = Array.isArray(history)
        ? history.slice(-10).map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: String(h.text || '').slice(0, 500) }],
          }))
        : [];

      let lastError;
      for (const modelName of getGeminiModels()) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: SYSTEM_PROMPT,
          });
          const chat = model.startChat({ history: safeHistory });
          const result = await chat.sendMessage(trimmed);
          return res.json({ reply: result.response.text(), mode: 'ai' });
        } catch (err) {
          lastError = err;
          const msg = err.message || '';
          if (/quota|429|503|not.?found|RESOURCE_EXHAUSTED/i.test(msg)) continue;
          break;
        }
      }
      // Gemini failed — fall through to rule-based
      console.warn('[chat] Gemini failed, using offline fallback:', lastError?.message);
    }

    // ── Offline rule-based fallback ──────────────────────────────────────────
    const reply = getRuleBasedReply(trimmed);
    return res.json({ reply, mode: 'offline' });

  } catch (err) {
    console.error('[chat] error:', err.message);
    res.status(500).json({ message: 'Chat is temporarily unavailable. Please try again shortly.' });
  }
});

module.exports = router;
