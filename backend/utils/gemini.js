'use strict';
/**
 * gemini.js — shared Gemini AI helper for product salt & description auto-fill
 */
const fs = require('fs');
const path = require('path');

/**
 * Reads config from process.env first, then directly from backend/.env file.
 * This bypasses dotenv issues with cPanel Passenger.
 */
const _cachedEnv = new Map();

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getEnvVar(name) {
  if (_cachedEnv.has(name)) return _cachedEnv.get(name);

  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.trim()) {
    const v = fromProcess.trim();
    _cachedEnv.set(name, v);
    return v;
  }

  const envPaths = [
    path.join(__dirname, '..', '.env'),           // backend/.env
    path.join(__dirname, '..', '..', '.env'),     // root .env
  ];

  const re = new RegExp(`^${escapeRegex(name)}=(.+)$`, 'm');
  for (const envPath of envPaths) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(re);
      if (match && match[1].trim()) {
        const v = match[1].trim();
        _cachedEnv.set(name, v);
        process.env[name] = v;
        return v;
      }
    } catch {}
  }

  _cachedEnv.set(name, null);
  return null;
}

function getGeminiKey() {
  const key = getEnvVar('GEMINI_API_KEY');
  return (typeof key === 'string' && key.length > 10) ? key : null;
}

function buildPrompt(name, brand, category) {
  return `You are a pharmacy database assistant for an Indian medical store (Batla Medicos, New Delhi).
Given this product:
  Name: "${name}"
  Brand: "${brand || 'Unknown'}"
  Category: "${category || 'Medicine'}"

Rules:
- For medicines: salt = active ingredient + strength (e.g. "Paracetamol 500mg", "Amoxicillin 500mg + Clavulanate 125mg")
- For medical devices / surgical supplies: salt = "N/A — Medical Device"
- For cosmetics / shampoo / lotion / FMCG: salt = "Cosmetic formulation — see label"
- Description: one concise English sentence (max 120 chars) — what it treats or does

Return ONLY a valid JSON object, no markdown, no explanation:
{"salt":"...","description":"..."}`;
}

function parseGeminiResponse(text) {
  const cleaned = text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '');
  const m = cleaned.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error('No JSON in AI response');
  const obj = JSON.parse(m[0]);
  return {
    salt:        typeof obj.salt        === 'string' ? obj.salt.trim()        : '',
    description: typeof obj.description === 'string' ? obj.description.trim() : '',
  };
}

// Models to try in order — verified March 2026.
// gemini-1.5-* and gemini-1.0-* families are all discontinued (404).
const FALLBACK_GEMINI_MODELS = [
  'gemini-2.0-flash',       // primary
  'gemini-2.0-flash-lite',  // lighter fallback
];

function getGeminiModels() {
  const preferred = getEnvVar('GEMINI_MODEL') || 'gemini-2.0-flash';
  const list = [preferred, ...FALLBACK_GEMINI_MODELS];
  return [...new Set(list.map((m) => String(m || '').trim()).filter(Boolean))];
}

// Backwards-compatible export (resolved at module load)
const GEMINI_MODELS = getGeminiModels();

/**
 * Calls Gemini to fill salt+description for one product.
 * Tries multiple models in order until one succeeds.
 * Returns { salt, description } or throws.
 */
async function geminiAutoFill(name, brand, category) {
  const geminiKey = getGeminiKey();
  if (!geminiKey) throw new Error('GEMINI_API_KEY not configured on server. Add it to backend/.env file.');

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiKey);
  const prompt = buildPrompt(name, brand, category);

  let lastError;
  for (const modelName of getGeminiModels()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return parseGeminiResponse(result.response.text());
    } catch (err) {
      lastError = err;
      // Only continue to next model on quota/not-found errors
      const msg = err.message || '';
      const isRetryable = msg.includes('429') || msg.includes('quota') ||
        msg.includes('not found') || msg.includes('404') ||
        msg.includes('RESOURCE_EXHAUSTED') || msg.includes('MODEL_NOT_FOUND');
      if (!isRetryable) throw err; // hard error, don't retry
    }
  }
  throw lastError;
}

/**
 * Silently fills a product's salt+description via AI if either field is empty.
 * Designed to be called fire-and-forget (no await needed at call site).
 */
async function autoFillProductIfEmpty(product) {
  try {
    const needsSalt = !product.salt || product.salt.trim() === '';
    const needsDesc = !product.description || product.description.trim() === '';
    if (!needsSalt && !needsDesc) return; // already filled

    const category = product.populated?.('category')
      ? product.category?.name
      : undefined;

    const { salt, description } = await geminiAutoFill(
      product.name,
      product.brand,
      category
    );

    const update = {};
    if (salt        && needsSalt) update.salt        = salt.slice(0, 500);
    if (description && needsDesc) update.description = description.slice(0, 1000);
    if (!Object.keys(update).length) return;

    const Product = require('../models/Product');
    await Product.updateOne({ _id: product._id }, { $set: update });
  } catch {
    // Silent failure — don't break the API response
  }
}

/**
 * Tests all models with a simple prompt and returns which ones work.
 * Returns array of { model, ok, error } results.
 */
async function testAllModels() {
  const geminiKey = getGeminiKey();
  if (!geminiKey) return [{ model: 'N/A', ok: false, error: 'GEMINI_API_KEY not set' }];

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiKey);
  const testPrompt = 'Reply with exactly: {"salt":"Paracetamol 500mg","description":"Fever and pain relief."}';

  const results = [];
  for (const modelName of getGeminiModels()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(testPrompt);
      const text = result.response.text();
      results.push({ model: modelName, ok: true, response: text.slice(0, 80) });
    } catch (err) {
      results.push({ model: modelName, ok: false, error: err.message?.slice(0, 120) || 'Unknown error' });
    }
  }
  return results;
}

module.exports = {
  buildPrompt,
  parseGeminiResponse,
  geminiAutoFill,
  autoFillProductIfEmpty,
  testAllModels,
  getGeminiKey,
  getGeminiModels,
  GEMINI_MODELS,
  FALLBACK_GEMINI_MODELS,
};
