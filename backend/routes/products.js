const express = require('express');
const { body, query: queryValidator, param, validationResult } = require('express-validator');
const XLSX = require('xlsx');
const slugify = require('../utils/slugify');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const auditLogger = require('../middleware/auditLogger');
const { query, execute } = require('../db/mysql');
const { geminiAutoFill } = require('../utils/gemini');

const router = express.Router();

const SLUG_ALIASES = {
  alopathic: 'allopathic',
  ayuveidc: 'ayurvedic',
  ayurvedc: 'ayurvedic',
  ayurvedik: 'ayurvedic',
  cosmetic: 'cosmetics',
  baby: 'baby-products',
  keimed: 'generic',
  'keimed-generics': 'generic',
  // All personal-care tile slugs are now handled by LIFESTYLE_SLUGS
  // (oral-care, women-care, men-grooming, elderly-care all use indexed lifestyle_category column)
  // Typo/wrong-name aliases
  'sexual':           'sexual-wellness', // admin brand named "Sexual" instead of "Sexual Wellness"
};

// ── Virtual parent-group slugs (used in CategoryNav) ────────────────────────
// Maps a URL ?category= slug → array of real DB category slugs
const PARENT_GROUPS = {
  // ── CategoryNav top-level groups ─────────────────────────────────────────
  // Health Resource Center
  allopathic:           ['allopathic', 'caps-tabs', 'liquids', 'cream-ointment', 'drop', 'powder',
                         'injection', 'inhaler', 'softgel-capsules', 'fluids', 'high-value',
                         'generic', 'fridge', 'vaccines', 'dental', 'otc'],
  // Homeopathy group
  homeopathy:           ['homeopathy', 'drop', 'liquids', 'caps-tabs', 'powder'],
  // Ayurveda group
  ayurveda:             ['ayurvedic', 'herbal', 'caps-tabs', 'liquids', 'lotion', 'powder', 'cream-ointment'],
  // NOTE: All LIFESTYLE_SLUGS (hair-care, skin-care, baby-care, fitness-health,
  // vitamins-nutrition, diabetes-care, supports-braces, immunity-boosters, sexual-wellness)
  // are intentionally NOT in PARENT_GROUPS — they use LIFESTYLE_FALLBACK_WHERE keyword
  // filtering which is far more precise than broad generic DB category IDs.

  // ── Legacy / alias parent slugs ─────────────────────────────────────────
  ayurvedic:            ['ayurvedic', 'herbal'],
  cosmetics:            ['cream-ointment', 'lotion', 'fmcg'],
  'baby-products':      ['nutrition', 'drop', 'lotion', 'powder'],
  surgical:             ['surgicals', 'container', 'pharma-misc'],
  surgicals:            ['surgicals', 'container', 'pharma-misc'],
  herbal:               ['herbal', 'ayurvedic'],
};

// Lifestyle slugs — products carry an indexed lifestyle_category column set at import time.
// Querying by this column is fast (single indexed equality) vs. N×LIKE scans.
const LIFESTYLE_SLUGS = new Set([
  'sexual-wellness', 'oral-care', 'women-care', 'men-grooming', 'elderly-care',
  'skin-care', 'hair-care', 'baby-care',
  'fitness-health', 'vitamins-nutrition', 'diabetes-care', 'supports-braces',
  'immunity-boosters',
]);

// lifestyle_category is populated at import time (classifyLifestyle.js) and for existing
// products via: node scripts/classifyProducts.js
// Each entry below is also a LIKE-keyword fallback so pages work IMMEDIATELY even before
// classifyProducts.js has been run. Once the script runs, the indexed equality is hit first.
// Rules: simple LIKE only (no REGEXP — MySQL 5.7 REGEXP on 169k rows is unreliable).
// Values are hardcoded keywords — NOT user input — so no parameterised binding is needed.
const LIFESTYLE_FALLBACK_WHERE = {
  'sexual-wellness': [
    "p.name LIKE '%condom%'",
    "p.name LIKE '%contraceptive%'",
    "p.name LIKE '%lubricant%'",
    "p.name LIKE '%pregnancy test%'",
    "p.name LIKE '%pregnancy kit%'",
    "p.name LIKE '%ovulation%'",
    "p.name LIKE '%ipill%'",
    "p.name LIKE '%i-pill%'",
    "p.name LIKE '%unwanted%'",
    "p.name LIKE '%prega news%'",
    "p.name LIKE '%pregaNews%'",
    "p.name LIKE '%erectile%'",
    "p.salt LIKE '%sildenafil%'",
    "p.salt LIKE '%tadalafil%'",
    "p.salt LIKE '%vardenafil%'",
    "p.brand LIKE '%Durex%'",
    "p.brand LIKE '%Manforce%'",
    "p.brand LIKE '%Skore%'",
    "p.brand LIKE '%KamaSutra%'",
    "p.brand LIKE '%Moods%'",
    "p.brand LIKE '%Kohinoor%'",
    "p.description LIKE '%sexual wellness%'",
    "p.description LIKE '%contraception%'",
  ],
  'hair-care': [
    "p.name LIKE '%shampoo%'",
    "p.name LIKE '%hair oil%'",
    "p.name LIKE '%hair serum%'",
    "p.name LIKE '%hair mask%'",
    "p.name LIKE '%hair colour%'",
    "p.name LIKE '%hair color%'",
    "p.name LIKE '%hair dye%'",
    "p.name LIKE '%hair fall%'",
    "p.name LIKE '%hairfall%'",
    "p.name LIKE '%hair loss%'",
    "p.name LIKE '%dandruff%'",
    "p.name LIKE '%anti-dandruff%'",
    "p.name LIKE '%antidandruff%'",
    "p.name LIKE '%hair growth%'",
    "p.name LIKE '%hair cream%'",
    "p.name LIKE '%hair tonic%'",
    "p.name LIKE '%hair gel%'",
    "p.name LIKE '%hair wax%'",
    "p.name LIKE '%hair pack%'",
    "p.name LIKE '%hair spa%'",
    "p.name LIKE '%hair lotion%'",
    "p.name LIKE '%hair conditioner%'",
    "p.name LIKE '%hair creme%'",
    "p.name LIKE '%hair spray%'",
    "p.name LIKE '%highlighting kit%'",
    "p.name LIKE '%hair wax%'",
    "p.name LIKE '%hair gel%'",
    "p.brand LIKE '%Pantene%'",
    "p.brand LIKE '%Head & Shoulders%'",
    "p.brand LIKE '%TRESemme%'",
    "p.brand LIKE '%Kesh King%'",
    "p.brand LIKE '%Indulekha%'",
    "p.brand LIKE '%L''Oreal Paris%'",
    "p.brand LIKE '%Streax%'",
  ],
  'skin-care': [
    "p.name LIKE '%moisturizer%'",
    "p.name LIKE '%moisturiser%'",
    "p.name LIKE '%sunscreen%'",
    "p.name LIKE '%sun screen%'",
    "p.name LIKE '%face wash%'",
    "p.name LIKE '%face cream%'",
    "p.name LIKE '%face pack%'",
    "p.name LIKE '%face mask%'",
    "p.name LIKE '%face serum%'",
    "p.name LIKE '%toner%'",
    "p.name LIKE '%lip balm%'",
    "p.name LIKE '%body lotion%'",
    "p.name LIKE '%body wash%'",
    "p.name LIKE '%fairness%'",
    "p.name LIKE '%glow cream%'",
    "p.name LIKE '%anti aging%'",
    "p.name LIKE '%anti-aging%'",
    "p.name LIKE '%spf%'",
    "p.brand LIKE '%Cetaphil%'",
    "p.brand LIKE '%Neutrogena%'",
    "p.brand LIKE '%Lacto Calamine%'",
    "p.brand LIKE '%Ponds%'",
    "p.brand LIKE '%Lakme%'",
    "p.brand LIKE '%L''Oreal Paris%'",
  ],
  'baby-care': [
    "p.name LIKE '%baby oil%'",
    "p.name LIKE '%baby powder%'",
    "p.name LIKE '%baby soap%'",
    "p.name LIKE '%baby shampoo%'",
    "p.name LIKE '%baby lotion%'",
    "p.name LIKE '%baby cream%'",
    "p.name LIKE '%baby wash%'",
    "p.name LIKE '%baby drops%'",
    "p.name LIKE '%diaper rash%'",
    "p.name LIKE '%nappy rash%'",
    "p.name LIKE '%gripe water%'",
    "p.name LIKE '%infant%'",
    "p.name LIKE '%teething%'",
    "p.brand LIKE '%Himalaya Baby%'",
    "p.brand LIKE '%Mee Mee%'",
    "p.brand LIKE '%Sebamed%'",
    "p.brand LIKE '%Chicco%'",
  ],
  'fitness-health': [
    "p.name LIKE '%protein powder%'",
    "p.name LIKE '%whey protein%'",
    "p.name LIKE '%whey%'",
    "p.name LIKE '%mass gainer%'",
    "p.name LIKE '%pre workout%'",
    "p.name LIKE '%pre-workout%'",
    "p.name LIKE '%bcaa%'",
    "p.name LIKE '%creatine%'",
    "p.name LIKE '%energy drink%'",
    "p.name LIKE '%gym supplement%'",
    "p.name LIKE '%fitness%'",
    "p.name LIKE '%sports nutrition%'",
    "p.name LIKE '%protein bar%'",
    "p.name LIKE '%energy bar%'",
    "p.name LIKE '%nutrition shake%'",
    "p.name LIKE '%meal replacement%'",
    "p.name LIKE '%weight gainer%'",
    "p.name LIKE '%lean mass%'",
    "p.name LIKE '%fat burner%'",
    "p.name LIKE '%amino acid%'",
    "p.name LIKE '%glutamine%'",
    "p.name LIKE '%electrolyte%'",
    "p.name LIKE '%health drink%'",
    "p.name LIKE '%nutrition drink%'",
    "p.name LIKE '%supplement powder%'",
    "p.name LIKE '%protein shake%'",
    "p.name LIKE '%recovery drink%'",
    "p.name LIKE '%muscle%'",
    "p.name LIKE '%Horlicks%'",
    "p.name LIKE '%Complan%'",
    "p.name LIKE '%Bournvita%'",
    "p.name LIKE '%Pediasure%'",
    "p.brand LIKE '%MuscleBlaze%'",
    "p.brand LIKE '%Protinex%'",
    "p.brand LIKE '%HealthKart%'",
    "p.brand LIKE '%Muscletech%'",
    "p.brand LIKE '%GNC%'",
    "p.brand LIKE '%Horlicks%'",
    "p.brand LIKE '%Complan%'",
    "p.brand LIKE '%Pediasure%'",
    "p.brand LIKE '%Optimum Nutrition%'",
    "p.brand LIKE '%Fast&Up%'",
    "p.brand LIKE '%Gatorade%'",
  ],
  'vitamins-nutrition': [
    "p.name LIKE '%vitamin%'",
    "p.name LIKE '%multivitamin%'",
    "p.name LIKE '%multi vitamin%'",
    "p.name LIKE '%omega%'",
    "p.name LIKE '%fish oil%'",
    "p.name LIKE '%calcium tablet%'",
    "p.name LIKE '%iron tablet%'",
    "p.name LIKE '%zinc supplement%'",
    "p.name LIKE '%folic acid%'",
    "p.name LIKE '%nutrition%'",
    "p.salt LIKE '%ascorbic acid%'",
    "p.salt LIKE '%cholecalciferol%'",
    "p.salt LIKE '%cyanocobalamin%'",
    "p.salt LIKE '%pyridoxine%'",
    "p.salt LIKE '%thiamine%'",
    "p.brand LIKE '%Revital%'",
    "p.brand LIKE '%Supradyn%'",
    "p.brand LIKE '%Becosules%'",
    "p.brand LIKE '%Neurobion%'",
    "p.brand LIKE '%Centrum%'",
    "p.brand LIKE '%Berocca%'",
  ],
  'diabetes-care': [
    "p.name LIKE '%glucometer%'",
    "p.name LIKE '%glucose monitor%'",
    "p.name LIKE '%glucose meter%'",
    "p.name LIKE '%test strip%'",
    "p.name LIKE '%lancet%'",
    "p.name LIKE '%insulin syringe%'",
    "p.name LIKE '%insulin needle%'",
    "p.name LIKE '%blood glucose%'",
    "p.name LIKE '%diabetic%'",
    "p.name LIKE '%diabetes%'",
    "p.salt LIKE '%metformin%'",
    "p.salt LIKE '%glimepiride%'",
    "p.salt LIKE '%sitagliptin%'",
    "p.salt LIKE '%voglibose%'",
    "p.salt LIKE '%gliclazide%'",
    "p.salt LIKE '%glipizide%'",
    "p.salt LIKE '%insulin%'",
    "p.brand LIKE '%Accu-Chek%'",
    "p.brand LIKE '%OneTouch%'",
    "p.brand LIKE '%Dr. Morepen%'",
    "p.description LIKE '%diabetes%'",
    "p.description LIKE '%diabetic%'",
  ],
  'supports-braces': [
    "p.name LIKE '%knee cap%'",
    "p.name LIKE '%knee support%'",
    "p.name LIKE '%knee brace%'",
    "p.name LIKE '%elbow support%'",
    "p.name LIKE '%wrist support%'",
    "p.name LIKE '%ankle support%'",
    "p.name LIKE '%ankle brace%'",
    "p.name LIKE '%lumbar belt%'",
    "p.name LIKE '%lumbar support%'",
    "p.name LIKE '%back support%'",
    "p.name LIKE '%back brace%'",
    "p.name LIKE '%cervical collar%'",
    "p.name LIKE '%abdominal belt%'",
    "p.name LIKE '%crepe bandage%'",
    "p.name LIKE '%elastic bandage%'",
    "p.name LIKE '%compression stocking%'",
    "p.name LIKE '%compression sock%'",
    "p.name LIKE '%shoulder support%'",
    "p.name LIKE '%wrist brace%'",
    "p.name LIKE '%thumb support%'",
    "p.name LIKE '%finger splint%'",
    "p.name LIKE '%heel cup%'",
    "p.name LIKE '%insole%'",
    "p.name LIKE '%orthopaedic%'",
    "p.name LIKE '%orthopedic%'",
    "p.name LIKE '%BP monitor%'",
    "p.name LIKE '%blood pressure monitor%'",
    "p.name LIKE '%nebulizer%'",
    "p.name LIKE '%nebuliser%'",
    "p.name LIKE '%thermometer%'",
    "p.name LIKE '%pulse oximeter%'",
    "p.name LIKE '%oximeter%'",
    "p.name LIKE '%wheelchair%'",
    "p.name LIKE '%walker%'",
    "p.name LIKE '%crutch%'",
    "p.name LIKE '%surgical tape%'",
    "p.name LIKE '%adhesive tape%'",
    "p.name LIKE '%wound dressing%'",
    "p.name LIKE '%gauze%'",
    "p.name LIKE '%cotton bandage%'",
    "p.name LIKE '%plaster%'",
    "p.name LIKE '%stethoscope%'",
    "p.name LIKE '%syringe%'",
    "p.name LIKE '%IV set%'",
    "p.name LIKE '%urine bag%'",
    "p.name LIKE '%catheter%'",
    "p.name LIKE '%gloves%'",
    "p.name LIKE '%surgical gloves%'",
    "p.name LIKE '%face mask%'",
    "p.name LIKE '%surgical mask%'",
    "p.name LIKE '%N95%'",
    "p.name LIKE '%vaporizer%'",
    "p.name LIKE '%hot water bag%'",
    "p.name LIKE '%ice bag%'",
    "p.name LIKE '%heating pad%'",
    "p.name LIKE '%hand sanitizer%'",
    "p.name LIKE '%sanitizer%'",
    "p.brand LIKE '%Omron%'",
    "p.brand LIKE '%Romsons%'",
    "p.brand LIKE '%Dr. Morepen%'",
    "p.brand LIKE '%Vissco%'",
    "p.brand LIKE '%Tynor%'",
    "p.brand LIKE '%Flamingo%'",
    "p.brand LIKE '%3M%'",
  ],
  'immunity-boosters': [
    "p.name LIKE '%chyawanprash%'",
    "p.name LIKE '%giloy%'",
    "p.name LIKE '%ashwagandha%'",
    "p.name LIKE '%tulsi%'",
    "p.name LIKE '%turmeric%'",
    "p.name LIKE '%immunity booster%'",
    "p.name LIKE '%immune booster%'",
    "p.name LIKE '%immunity%'",
    "p.name LIKE '%elderberry%'",
    "p.name LIKE '%triphala%'",
    "p.name LIKE '%amla%'",
    "p.name LIKE '%shilajit%'",
    "p.name LIKE '%mulethi%'",
    "p.name LIKE '%shatavari%'",
    "p.name LIKE '%immune%'",
    "p.description LIKE '%immunity%'",
    "p.description LIKE '%immune%'",
  ],
  'oral-care': [
    "p.name LIKE '%toothpaste%'",
    "p.name LIKE '%tooth paste%'",
    "p.name LIKE '%toothbrush%'",
    "p.name LIKE '%tooth brush%'",
    "p.name LIKE '%tooth powder%'",
    "p.name LIKE '%tooth gel%'",
    "p.name LIKE '%mouthwash%'",
    "p.name LIKE '%mouth wash%'",
    "p.name LIKE '%mouth rinse%'",
    "p.name LIKE '%gum paint%'",
    "p.name LIKE '%gum gel%'",
    "p.name LIKE '%gum care%'",
    "p.name LIKE '%dental floss%'",
    "p.name LIKE '%tongue cleaner%'",
    "p.brand LIKE '%Colgate%'",
    "p.brand LIKE '%Sensodyne%'",
    "p.brand LIKE '%Pepsodent%'",
    "p.brand LIKE '%Oral-B%'",
    "p.brand LIKE '%Listerine%'",
    "p.brand LIKE '%Meswak%'",
    "p.brand LIKE '%HiOra%'",
    "p.brand LIKE '%CloseUp%'",
    "p.brand LIKE '%Vicco%'",
  ],
  'women-care': [
    "p.name LIKE '%sanitary pad%'",
    "p.name LIKE '%sanitary napkin%'",
    "p.name LIKE '%panty liner%'",
    "p.name LIKE '%menstrual cup%'",
    "p.name LIKE '%feminine hygiene%'",
    "p.name LIKE '%vaginal wash%'",
    "p.name LIKE '%intimate wash%'",
    "p.name LIKE '%women hygiene%'",
    "p.brand LIKE '%Sofy%'",
    "p.brand LIKE '%Whisper%'",
    "p.brand LIKE '%Stayfree%'",
    "p.brand LIKE '%Carefree%'",
    "p.brand LIKE '%Everteen%'",
    "p.brand LIKE '%V Wash%'",
    "p.brand LIKE '%Lactacyd%'",
    "p.salt LIKE '%progesterone%'",
    "p.salt LIKE '%oestrogen%'",
    "p.salt LIKE '%norethisterone%'",
    "p.salt LIKE '%levonorgestrel%'",
    "p.salt LIKE '%clomiphene%'",
    "p.salt LIKE '%letrozole%'",
    "p.description LIKE '%gynaecolog%'",
    "p.description LIKE '%menstrual%'",
    "p.description LIKE '%leucorrhoea%'",
    "p.name LIKE '%duphaston%'",
    "p.name LIKE '%primolut%'",
  ],
  'men-grooming': [
    "p.name LIKE '%shaving cream%'",
    "p.name LIKE '%shaving foam%'",
    "p.name LIKE '%shaving gel%'",
    "p.name LIKE '%after shave%'",
    "p.name LIKE '%aftershave%'",
    "p.name LIKE '%beard oil%'",
    "p.name LIKE '%beard balm%'",
    "p.name LIKE '%beard wax%'",
    "p.name LIKE '%beard serum%'",
    "p.brand LIKE '%Gillette%'",
    "p.brand LIKE '%Beardo%'",
    "p.brand LIKE '%Ustraa%'",
    "p.brand LIKE '%Bombay Shaving%'",
    "p.brand LIKE '%Park Avenue%'",
    "p.brand LIKE '%Old Spice%'",
    "p.brand LIKE '%Brylcreem%'",
  ],
  'elderly-care': [
    "p.name LIKE '%adult diaper%'",
    "p.name LIKE '%adult brief%'",
    "p.name LIKE '%adult absorbent%'",
    "p.name LIKE '%adult pant%'",
    "p.name LIKE '%incontinence pad%'",
    "p.name LIKE '%incontinence brief%'",
    "p.name LIKE '%pull up adult%'",
    "p.name LIKE '%bedsore%'",
    "p.name LIKE '%bed sore%'",
    "p.name LIKE '%pressure sore%'",
    "p.name LIKE '%geriatric%'",
    "p.name LIKE '%under pad%'",
    "p.name LIKE '%underpad%'",
    "p.name LIKE '%disposable sheet%'",
    "p.name LIKE '%mattress protector%'",
    "p.name LIKE '%bed protector%'",
    "p.name LIKE '%ryle tube%'",
    "p.name LIKE '%feeding tube%'",
    "p.name LIKE '%nasogastric%'",
    "p.name LIKE '%ryles tube%'",
    "p.name LIKE '%suction catheter%'",
    "p.name LIKE '%foley catheter%'",
    "p.name LIKE '%urine bag%'",
    "p.name LIKE '%urostomy%'",
    "p.name LIKE '%colostomy%'",
    "p.name LIKE '%stoma%'",
    "p.name LIKE '%enema%'",
    "p.name LIKE '%laxative%'",
    "p.name LIKE '%lactulose%'",
    "p.name LIKE '%bisacodyl%'",
    "p.name LIKE '%senna%'",
    "p.name LIKE '%psyllium%'",
    "p.name LIKE '%ispaghula%'",
    "p.name LIKE '%fibre supplement%'",
    "p.name LIKE '%fiber supplement%'",
    "p.name LIKE '%calcium supplement%'",
    "p.name LIKE '%calcium tablet%'",
    "p.name LIKE '%vitamin D%'",
    "p.name LIKE '%vitamin d3%'",
    "p.name LIKE '%bone health%'",
    "p.name LIKE '%joint pain%'",
    "p.name LIKE '%arthritis%'",
    "p.name LIKE '%anti arthritic%'",
    "p.name LIKE '%pain relief spray%'",
    "p.name LIKE '%pain relief gel%'",
    "p.name LIKE '%pain relief patch%'",
    "p.name LIKE '%diclofenac gel%'",
    "p.name LIKE '%volini%'",
    "p.name LIKE '%moov%'",
    "p.name LIKE '%combiflam%'",
    "p.name LIKE '%iodex%'",
    "p.name LIKE '%deep heat%'",
    "p.name LIKE '%hot gel%'",
    "p.name LIKE '%memory foam%'",
    "p.name LIKE '%anti bedsore%'",
    "p.name LIKE '%air mattress%'",
    "p.name LIKE '%egg crate%'",
    "p.name LIKE '%bed rail%'",
    "p.name LIKE '%walking stick%'",
    "p.name LIKE '%walking aid%'",
    "p.name LIKE '%cane%'",
    "p.name LIKE '%commode%'",
    "p.name LIKE '%bedpan%'",
    "p.name LIKE '%urinal%'",
    "p.name LIKE '%portable toilet%'",
    "p.name LIKE '%grab bar%'",
    "p.name LIKE '%shower chair%'",
    "p.name LIKE '%bath seat%'",
    "p.name LIKE '%hearing aid%'",
    "p.name LIKE '%magnifying glass%'",
    "p.name LIKE '%pill organizer%'",
    "p.name LIKE '%pill box%'",
    "p.name LIKE '%medicine box%'",
    "p.name LIKE '%compression stocking%'",
    "p.name LIKE '%compression sock%'",
    "p.salt LIKE '%calcitriol%'",
    "p.salt LIKE '%cholecalciferol%'",
    "p.salt LIKE '%alendronate%'",
    "p.salt LIKE '%risedronate%'",
    "p.brand LIKE '%Friends Easy%'",
    "p.brand LIKE '%Friends Premium%'",
    "p.brand LIKE '%Dignity%'",
    "p.brand LIKE '%Tena%'",
    "p.brand LIKE '%Assure%'",
    "p.brand LIKE '%Softmates%'",
    "p.brand LIKE '%Romsons%'",
    "p.brand LIKE '%Vissco%'",
    "p.brand LIKE '%Flamingo%'",
  ],
};

function normalizeCategorySlug(input = '') {
  const raw = String(input).trim().toLowerCase();
  return SLUG_ALIASES[raw] || raw;
}

function isCloudinaryUrl(url) {
  return typeof url === 'string' && /(^|\/\/)res\.cloudinary\.com\b|cloudinary\.com\b/i.test(url);
}

function parseImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((u) => typeof u === 'string')
      .map((u) => u.trim())
      .filter((u) => u && !isCloudinaryUrl(u));
  }
  if (typeof value === 'object') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .filter((u) => typeof u === 'string')
          .map((u) => u.trim())
          .filter((u) => u && !isCloudinaryUrl(u))
      : [];
  } catch {
    return [];
  }
}

function mapProduct(row) {
  // Parse secondary_category_ids JSON column safely
  let secondaryCategoryIds = [];
  if (row.secondary_category_ids) {
    try {
      const arr = typeof row.secondary_category_ids === 'string'
        ? JSON.parse(row.secondary_category_ids)
        : row.secondary_category_ids;
      secondaryCategoryIds = Array.isArray(arr) ? arr.map(Number).filter(Boolean) : [];
    } catch { secondaryCategoryIds = []; }
  }

  return {
    _id: String(row.id),
    code: row.code || '',
    name: row.name,
    slug: row.slug,
    category: row.category_id ? {
      _id: String(row.category_id),
      name: row.category_name,
      slug: row.category_slug,
    } : null,
    secondaryCategoryIds,
    brand: row.brand || '',
    company: row.company || '',
    description: row.description || '',
    pack: row.pack || '',
    mrp: Number(row.mrp || 0),
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
    requiresPrescription: Boolean(row.requires_prescription),
    images: parseImages(row.images_json),
    expiryDate: row.expiry_date,
    batchNumber: row.batch_number || '',
    salt: row.salt || '',
    sideEffects: row.side_effects || '',
    videoUrl: row.video_url || null,
    isActive: Boolean(row.is_active),
    isDeleted: Boolean(row.is_deleted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveCategoryIds(categoryParam) {
  if (!categoryParam) return null; // null = no filter (show all)
  const raw = String(categoryParam).trim();
  if (!raw) return null;

  // Numeric ID — direct lookup
  if (/^\d+$/.test(raw)) {
    const rows = await query('SELECT id FROM categories WHERE id = ? AND is_deleted = 0 LIMIT 1', [Number(raw)]);
    return rows.length ? [Number(raw)] : []; // [] = empty/invalid → 0 results
  }

  const slug = normalizeCategorySlug(raw);
  const group = PARENT_GROUPS[slug] || [slug];
  const rows = await query(
    `SELECT id FROM categories WHERE is_deleted = 0 AND slug IN (${group.map(() => '?').join(', ')})`,
    group
  );
  // If slug matched a group but none of the sub-slugs are seeded yet, return null (show all)
  // rather than [] which would return 0 products
  if (!rows.length) return null;
  return rows.map((row) => Number(row.id));
}

function buildProductWhere({ admin = false, params = {}, categoryIds = [] } = {}) {
  const where = [];
  const values = [];

  where.push('p.is_deleted = 0');
  if (!admin) {
    where.push('p.is_active = 1');
    where.push('p.price >= 50');
  }

  if (categoryIds.length) {
    // Also match products where any of the requested categories appear in secondary_category_ids
    const inPlaceholders = categoryIds.map(() => '?').join(', ');
    const secondaryChecks = categoryIds
      .map(() => `JSON_CONTAINS(COALESCE(p.secondary_category_ids, '[]'), CAST(? AS JSON))`)
      .join(' OR ');
    where.push(`(p.category_id IN (${inPlaceholders}) OR ${secondaryChecks})`);
    values.push(...categoryIds, ...categoryIds);
  }

  if (params.requiresPrescription !== undefined) {
    where.push('p.requires_prescription = ?');
    values.push(params.requiresPrescription ? 1 : 0);
  }

  if (params.brand) {
    // Also match brands stored with apostrophes e.g. "L'Oreal" when user searches "LOREAL"
    where.push("(p.brand LIKE ? OR REPLACE(p.brand, '''', '') LIKE ?)");
    values.push(`%${params.brand}%`, `%${params.brand}%`);
  }

  if (params.lifestyleCategory) {
    const fallbacks = LIFESTYLE_FALLBACK_WHERE[params.lifestyleCategory] || [];
    if (fallbacks.length) {
      // Use LIKE keyword scan ONLY — does NOT reference the lifestyle_category column.
      // This works immediately on any DB state (column missing, column all-NULL, etc.).
      // Column-based index query can be added here once classifyProducts.js --all is run.
      where.push(`(${fallbacks.join(' OR ')})`);
    } else {
      // Slugs with no LIKE fallbacks (skin-care, hair-care, etc.) — rely on column.
      // These require classifyProducts.js to have run.
      where.push('p.lifestyle_category = ?');
      values.push(params.lifestyleCategory);
    }
  } else if (params.search) {
    const raw = params.search;
    const stripped = raw.replace(/[\s\-_.\/]+/g, '');
    where.push(
      '(p.name LIKE ? OR p.brand LIKE ? OR p.company LIKE ? OR p.description LIKE ? OR p.salt LIKE ?' +
      ' OR REPLACE(REPLACE(REPLACE(REPLACE(p.name, " ", ""), "-", ""), ".", ""), "/", "") LIKE ?' +
      ' OR REPLACE(REPLACE(REPLACE(REPLACE(p.brand, " ", ""), "-", ""), ".", ""), "/", "") LIKE ?' +
      ' OR REPLACE(REPLACE(REPLACE(REPLACE(p.salt, " ", ""), "-", ""), ".", ""), "/", "") LIKE ?)'
    );
    values.push(
      `%${raw}%`, `%${raw}%`, `%${raw}%`, `%${raw}%`, `%${raw}%`,
      `%${stripped}%`, `%${stripped}%`, `%${stripped}%`
    );
  }

  if (admin) {
    if (params.status === 'active') where.push('p.is_active = 1');
    if (params.status === 'inactive') where.push('p.is_active = 0');
    if (params.stockFilter === 'out') where.push('p.stock = 0');
    if (params.stockFilter === 'in') where.push('p.stock > 10');
    if (params.stockFilter === 'low') where.push('p.stock > 0 AND p.stock <= 10');
    if (params.discountFilter === 'none') where.push('p.price >= p.mrp');
    if (params.discountFilter === 'low') where.push('p.price < p.mrp AND p.price >= (p.mrp * 0.8)');
    if (params.discountFilter === 'mid') where.push('p.price < (p.mrp * 0.8) AND p.price >= (p.mrp * 0.5)');
    if (params.discountFilter === 'high') where.push('p.price < (p.mrp * 0.5)');
    if (params.missingInfo === '1') where.push("(COALESCE(p.salt, '') = '' OR COALESCE(p.description, '') = '')");
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', values };
}

function sortSql(sort, admin = false) {
  const publicSort = {
    price_asc:    'p.price ASC',
    price_desc:   'p.price DESC',
    name_asc:     'p.name ASC',
    name_desc:    'p.name DESC',
    newest:       'p.created_at DESC',
    category_asc: 'c.name ASC, p.name ASC',
    category_desc:'c.name DESC, p.name ASC',
  };
  const adminSort = {
    newest:       'p.created_at DESC',
    name_asc:     'p.name ASC',
    name_desc:    'p.name DESC',
    stock_asc:    'p.stock ASC',
    stock_desc:   'p.stock DESC',
    price_asc:    'p.price ASC',
    price_desc:   'p.price DESC',
    category_asc: 'c.name ASC, p.name ASC',
    category_desc:'c.name DESC, p.name ASC',
  };
  const map = admin ? adminSort : publicSort;
  return map[sort] || 'p.created_at DESC';
}

async function fetchProducts({ whereSql, values, sort, limit, offset }) {
  const rows = await query(
    `SELECT p.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ${whereSql}
     ORDER BY ${sort}
     LIMIT ? OFFSET ?`,
    [...values, Number(limit), Number(offset)]
  );
  return rows.map(mapProduct);
}

router.get('/', [
  queryValidator('page').optional().isInt({ min: 1 }).toInt(),
  queryValidator('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  queryValidator('category').optional().trim().isLength({ min: 1, max: 120 }),
  queryValidator('search').optional().trim().isLength({ max: 100 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);

    const catSlug = req.query.category ? normalizeCategorySlug(req.query.category) : null;
    // LIFESTYLE_SLUGS always use keyword-based filtering (LIFESTYLE_FALLBACK_WHERE).
    // This is more precise than PARENT_GROUPS which maps to broad generic DB categories.
    const isLifestyle = catSlug ? LIFESTYLE_SLUGS.has(catSlug) : false;

    let categoryIds, lifestyleCategory;
    if (isLifestyle) {
      categoryIds     = null;
      lifestyleCategory = catSlug;
    } else {
      categoryIds = await resolveCategoryIds(req.query.category);
      if (Array.isArray(categoryIds) && !categoryIds.length) {
        return res.json({ products: [], total: 0, page, pages: 0 });
      }
    }

    const { whereSql, values } = buildProductWhere({
      params: { ...req.query, lifestyleCategory },
      categoryIds: categoryIds || [],
    });
    const [products, totalRows] = await Promise.all([
      fetchProducts({ whereSql, values, sort: sortSql(req.query.sort), limit, offset: (page - 1) * limit }),
      query(`SELECT COUNT(*) AS total FROM products p ${whereSql}`, values),
    ]);

    const total = Number(totalRows[0]?.total || 0);
    res.json({ products, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.get('/brands', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT brand, COUNT(*) AS count
       FROM products
       WHERE is_deleted = 0 AND is_active = 1 AND COALESCE(brand, '') <> ''
       GROUP BY brand
       ORDER BY count DESC, brand ASC
       LIMIT 50`,
      []
    );
    res.json({ brands: rows.map((row) => ({ brand: row.brand, count: Number(row.count || 0) })) });
  } catch (err) { next(err); }
});

router.get('/admin/list', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);

    const catSlug = req.query.category ? normalizeCategorySlug(req.query.category) : null;
    const isLifestyle = catSlug ? LIFESTYLE_SLUGS.has(catSlug) : false;

    let categoryIds, lifestyleCategory;
    if (isLifestyle) {
      categoryIds     = null;
      lifestyleCategory = catSlug;
    } else {
      categoryIds = await resolveCategoryIds(req.query.category);
      if (Array.isArray(categoryIds) && !categoryIds.length) {
        return res.json({ products: [], total: 0, page, pages: 0 });
      }
    }

    const { whereSql, values } = buildProductWhere({
      admin: true,
      params: { ...req.query, lifestyleCategory },
      categoryIds: categoryIds || [],
    });
    const [products, totalRows] = await Promise.all([
      fetchProducts({ whereSql, values, sort: sortSql(req.query.sort, true), limit, offset: (page - 1) * limit }),
      query(`SELECT COUNT(*) AS total FROM products p ${whereSql}`, values),
    ]);

    const total = Number(totalRows[0]?.total || 0);
    res.json({ products, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.get('/import-template', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    // Fetch categories only — template is a BLANK template for adding new products
    const categories = await query(
      'SELECT id, slug, name FROM categories WHERE is_deleted = 0 ORDER BY ord ASC, name ASC', []
    );

    const wb = XLSX.utils.book_new();

    // Products sheet — blank with headers + 1 example row
    const headers = ['id', 'name', 'brand', 'salt', 'category', 'mrp', 'price', 'stock', 'requiresPrescription', 'code', 'pack', 'batchNumber', 'isActive'];
    const exampleRow = ['', 'Paracetamol 650 Tablet', 'Cipla', 'Paracetamol 650mg', 'caps-tabs', 35, 30, 120, 'false', 'PARA650-01', '10 tablets strip', 'BATCH-2026-01', 'true'];

    const wsProducts = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    wsProducts['!freeze'] = { xSplit: 0, ySplit: 1 };
    wsProducts['!cols'] = [{ wch: 8 }, { wch: 40 }, { wch: 20 }, { wch: 25 },
                           { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];

    const wsCategories = XLSX.utils.aoa_to_sheet([['slug', 'name'], ...categories.map(r => [r.slug, r.name])]);

    const wsGuide = XLSX.utils.aoa_to_sheet([
      ['HOW TO USE THIS TEMPLATE', ''],
      ['', ''],
      ['This is a BLANK template for adding NEW products.', ''],
      ['To update existing products, use "Export Excel" instead — it includes product IDs.', ''],
      ['', ''],
      ['OPTION 1 — Update existing + Add new', 'Use "Update existing + Add new" when importing'],
      ['  • Rows WITH an id value  →  update that product (price, stock, brand, etc.)', ''],
      ['  • Rows WITHOUT an id     →  insert as a NEW product', ''],
      ['', ''],
      ['OPTION 2 — Add new products only', 'Use "Add new products only" when importing'],
      ['  • All rows are treated as new products regardless of id column', ''],
      ['  • id column is ignored', ''],
      ['', ''],
      ['Column', 'Required', 'Notes'],
      ['id', 'Leave blank for new products', 'Only needed when updating — use Export Excel to get IDs'],
      ['name', 'YES', 'Product name (max 200 chars)'],
      ['brand', 'no', 'Manufacturer / brand name'],
      ['salt', 'no', 'Active ingredient + strength'],
      ['category', 'no', 'Slug from Categories sheet. Use commas for multiple: caps-tabs, ayurvedic (first = primary)'],
      ['mrp', 'no', 'Maximum Retail Price (numeric)'],
      ['price', 'no', 'Selling price (numeric, defaults to mrp if blank)'],
      ['stock', 'no', 'Stock quantity (numeric, default 0)'],
      ['requiresPrescription', 'no', 'true or false'],
      ['code', 'no', 'Product barcode / SKU'],
      ['pack', 'no', 'Pack size label (e.g. 10 tablets strip, 100ml)'],
      ['batchNumber', 'no', 'Batch / lot number'],
      ['isActive', 'no', 'true = visible on site, false = hidden (default true)'],
    ]);
    wsGuide['!cols'] = [{ wch: 60 }, { wch: 45 }];

    XLSX.utils.book_append_sheet(wb, wsProducts, 'Products');
    XLSX.utils.book_append_sheet(wb, wsCategories, 'Categories');
    XLSX.utils.book_append_sheet(wb, wsGuide, 'Guide');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `products-template-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

router.get('/csv-template', requireAuth, requireAdmin, (req, res) => {
  const header = 'name,brand,salt,description,side_effects,category,mrp,price,stock,requiresPrescription,code,pack,batchNumber';
  const example = '"Paracetamol 650 Tablet","Cipla","Paracetamol 650mg","Fever and pain relief","Nausea (rare)","caps-tabs",35,30,120,false,"PARA650-01","10 tablets strip","BATCH-2026-01"';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
  res.send(`${header}\n${example}\n`);
});

// Export as CSV — much lighter than xlsx for large catalogs (250k+ products)
// Supports optional filters: ?search=&category=&brand=&status=&stockFilter=
router.get('/export-excel', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    // Increase timeout for large exports
    req.setTimeout(120000); // 2 minutes

    const categoryIds = await resolveCategoryIds(req.query.category);
    const { whereSql, values } = buildProductWhere({
      admin: true,
      params: req.query,
      categoryIds: categoryIds || [],
    });

    const rows = await query(
      `SELECT p.id, p.name, p.brand, p.salt, p.description, p.side_effects,
              c.slug AS category_slug, p.mrp, p.price, p.stock,
              p.requires_prescription, p.code, p.pack, p.batch_number,
              p.is_active, p.slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${whereSql}
       ORDER BY p.created_at DESC
       LIMIT 50000`,
      values
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'No products found to export.' });
    }

    // Build real .xlsx with id as first column so imported rows can UPDATE by id
    const sheetData = [
      ['id', 'name', 'brand', 'salt', 'description', 'side_effects', 'category', 'mrp', 'price', 'stock', 'requiresPrescription', 'code', 'pack', 'batchNumber', 'isActive'],
      ...rows.map(r => [
        r.id,
        r.name || '',
        r.brand || '',
        r.salt || '',
        r.description || '',
        r.side_effects || '',
        r.category_slug || '',
        r.mrp,
        r.price,
        r.stock,
        r.requires_prescription ? 'true' : 'false',
        r.code || '',
        r.pack || '',
        r.batch_number || '',
        r.is_active ? 'true' : 'false',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    // Freeze the header row and auto-set column widths
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!cols'] = [{ wch: 8 }, { wch: 40 }, { wch: 20 }, { wch: 25 }, { wch: 50 }, { wch: 30 },
                   { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    // Guide sheet
    const guideData = [
      ['Column', 'Description'],
      ['id', 'Product ID from database. Keep it to UPDATE that product on re-import. Clear/leave blank to INSERT as new product.'],
      ['name', 'Product name (required)'],
      ['brand', 'Brand name'],
      ['salt', 'Active ingredient / salt composition'],
      ['description', 'Product description'],
      ['side_effects', 'Side effects'],
      ['category', 'Category slug (e.g. caps-tabs, fmcg, cream-ointment, ayurvedic)'],
      ['mrp', 'Maximum retail price'],
      ['price', 'Selling price (must be <= mrp)'],
      ['stock', 'Stock quantity'],
      ['requiresPrescription', 'true / false'],
      ['code', 'Barcode / item code'],
      ['pack', 'Pack size (e.g. 10 Tablets, 100ml)'],
      ['batchNumber', 'Batch / lot number'],
      ['isActive', 'true = visible on site, false = hidden'],
    ];
    const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
    wsGuide['!cols'] = [{ wch: 22 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsGuide, 'Guide');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `products-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (err) { next(err); }
});

router.get('/missing-info/count', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await query(
      "SELECT COUNT(*) AS total FROM products WHERE is_deleted = 0 AND (COALESCE(salt, '') = '' OR COALESCE(description, '') = '')",
      []
    );
    res.json({ count: Number(rows[0]?.total || 0) });
  } catch (err) { next(err); }
});

router.post('/request-availability', [
  body('medicineName').trim().isLength({ min: 2, max: 180 }),
  body('customerName').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 25 }),
  body('email').optional({ values: 'falsy' }).trim().isEmail().isLength({ max: 190 }),
  body('searchQuery').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    await execute(
      `INSERT INTO availability_requests
        (medicine_name, customer_name, phone, email, search_query, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [
        String(req.body.medicineName || '').trim(),
        String(req.body.customerName || '').trim(),
        String(req.body.phone || '').trim(),
        String(req.body.email || '').trim().toLowerCase(),
        String(req.body.searchQuery || '').trim(),
      ]
    );

    res.status(201).json({
      message: 'Request received. Batla Medicos will contact you if medicine becomes available.',
    });
  } catch (err) { next(err); }
});

// ── Bulk import via CSV/Excel upload ────────────────────────────────────────
const { uploadSpreadsheet } = require('../middleware/upload');
const { parse: parseCsv } = require('csv-parse/sync');

// Column name normaliser (strips non-alphanumeric for fuzzy matching)
function _headKey(v) { return String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// Find index of first header that matches any alias
function _col(headers, ...aliases) {
  const keys = headers.map(_headKey);
  for (const a of aliases) {
    const i = keys.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

// CSV type → category slug (MUST match seeded DB category slugs exactly)
// Run: SELECT slug FROM categories WHERE is_deleted = 0 ORDER BY ord to see all valid slugs.
const _TYPE_SLUG = {
  allopathy:   'caps-tabs',  allopathic:  'caps-tabs',
  ayurvedic:   'ayurvedic',  ayurveda:    'ayurvedic',
  homeopathy:  'homeopathy',                // FIX: was 'caps-tabs' — homeopathy is a seeded slug
  unani:       'herbal',     siddha:       'herbal',
  surgical:    'surgicals',  otc:          'otc',
  cosmetic:    'fmcg',       cosmetics:    'fmcg',      // FIX: 'cosmetics' not a DB slug → fmcg
  nutritional: 'nutrition',  nutrition:    'nutrition',
  dental:      'dental',
  baby:        'fmcg',                                  // FIX: 'baby-products' not a DB slug → fmcg
  vaccine:     'vaccines',
};

router.post(
  '/bulk-import',
  requireAuth, requireAdmin,
  (req, res, next) => {
    uploadSpreadsheet.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: 'File size too large. Maximum allowed size is 50 MB.' });
        }
        return res.status(400).json({ message: err.message || 'File upload failed.' });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

      const ext = (req.file.originalname || '').split('.').pop().toLowerCase();
      const mode = req.body.mode === 'replace' ? 'replace' : req.body.mode === 'update' ? 'update' : 'append'; // default: append

      // ── Parse file buffer → array of row objects ────────────────────────
      let rows = [];
      if (ext === 'csv') {
        rows = parseCsv(req.file.buffer, {
          columns: true, skip_empty_lines: true,
          relax_quotes: true, trim: true,
        });
      } else {
        // xlsx / xls
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      }

      if (!rows.length) return res.status(400).json({ message: 'File is empty or could not be parsed.' });

      // ── Detect columns (supports both CSV schema & Excel schema) ─────────
      const headers = Object.keys(rows[0]);
      const C = {
        name:   _col(headers, 'name', 'itemname', 'item', 'productname', 'medicine', 'medicinename'),
        mrp:    _col(headers, 'mrp', 'maxretailprice', 'originalprice'),
        price:  _col(headers, 'price', 'saleprice', 'discountedprice', 'rate'),
        brand:  _col(headers, 'manufacturername', 'manufacturer', 'brand', 'company'),
        pack:   _col(headers, 'packsizelabel', 'pack', 'packing', 'unit'),
        salt:   _col(headers, 'saltcomposition', 'salt', 'composition', 'shortcomposition1'),
        desc:   _col(headers, 'medicinedesc', 'description', 'desc'),
        se:     _col(headers, 'sideeffects', 'sideeffect'),
        active: _col(headers, 'isactive', 'active', 'status'),
        disc:   _col(headers, 'isdiscontinued', 'discontinued'),
        type:   _col(headers, 'type', 'itemcategory', 'category'),
        stock:  _col(headers, 'stock', 'qty', 'quantity'),
        code:   _col(headers, 'code', 'barcode', 'itemcode'),
        rx:     _col(headers, 'requiresprescription', 'prescription', 'rx'),
        batch:  _col(headers, 'batchnumber', 'batch', 'lotnumber'),
      };

      if (C.name < 0) return res.status(400).json({ message: 'Could not find a "name" column in the uploaded file.' });

      // Check if the file has an `id` column — used for update-by-id mode
      const C_id = _col(headers, 'id', 'productid', 'product_id');

      // Helper to get a cell value by column index
      const cell = (row, idx) => idx >= 0 ? String(row[headers[idx]] ?? '').trim() : '';

      // ── Load category map (slug → id) ───────────────────────────────────
      const catRows = await query('SELECT id, slug FROM categories WHERE is_deleted = 0');
      const catMap = {};
      for (const r of catRows) catMap[r.slug] = r.id;
      const fallbackCatId = catMap['caps-tabs'] || catRows[0]?.id;

      // ── REPLACE mode: delete existing products ──────────────────────────
      if (mode === 'replace') {
        await execute('DELETE FROM products');
      }

      // ── Insert in batches of 500 ────────────────────────────────────────
      const BATCH = 500;
      let inserted = 0, updated = 0, skipped = 0;

      function makeSlug(name, idx) {
        const base = name.toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '').replace(/[\s_]+/g, '-')
          .replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 200);
        return `${base}-${idx}`;
      }

      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const insertValues = [];

        for (let j = 0; j < chunk.length; j++) {
          const row = chunk[j];
          const rowIdx = i + j + 1;

          const name = cell(row, C.name).substring(0, 200);
          if (!name) { skipped++; continue; }

          const mrpRaw   = parseFloat(cell(row, C.mrp))   || parseFloat(cell(row, C.price)) || 0;
          const priceRaw = parseFloat(cell(row, C.price)) || mrpRaw;
          let isActive = 1;
          const activeRaw = cell(row, C.active).toLowerCase();
          const discRaw   = cell(row, C.disc).toLowerCase();
          if (activeRaw)       isActive = (activeRaw === 'true' || activeRaw === '1') ? 1 : 0;
          else if (discRaw)    isActive = (discRaw   === 'true' || discRaw   === '1') ? 0 : 1;
          const rxRaw      = cell(row, C.rx).toLowerCase();
          const requiresRx = (rxRaw === 'true' || rxRaw === '1') ? 1 : 0;
          // Support comma-separated categories: first = primary, rest = secondary
          const rawCat = cell(row, C.type);
          const catSlugs = rawCat ? rawCat.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
          const firstSlug = catSlugs[0] || '';
          const resolvedPrimary = catMap[firstSlug] ? firstSlug : (_TYPE_SLUG[firstSlug] || 'caps-tabs');
          const catId = catMap[resolvedPrimary] || fallbackCatId;
          if (!catId) { skipped++; continue; }
          const secondaryCatIds = catSlugs.slice(1)
            .map(s => catMap[s] || catMap[_TYPE_SLUG[s] || ''] || null)
            .filter(id => id && id !== catId);
          const secondaryJson = secondaryCatIds.length ? JSON.stringify(secondaryCatIds) : null;

          // ── UPDATE existing product by id ────────────────────────────────
          const rowId = C_id >= 0 ? parseInt(cell(row, C_id)) : NaN;
          if (!isNaN(rowId) && rowId > 0 && mode !== 'append') {
            // Only update if we can verify the product exists
            const exists = await query('SELECT id FROM products WHERE id = ? AND is_deleted = 0 LIMIT 1', [rowId]);
            if (exists.length) {
              const setClauses = [];
              const setVals = [];
              // Only update columns that were present in the file
              setClauses.push('name = ?');      setVals.push(name);
              if (C.brand  >= 0) { setClauses.push('brand = ?');       setVals.push(cell(row, C.brand).substring(0, 100)); }
              if (C.salt   >= 0) { setClauses.push('salt = ?');        setVals.push(cell(row, C.salt).substring(0, 500)); }
              if (C.desc   >= 0) { setClauses.push('description = ?'); setVals.push(cell(row, C.desc) || null); }
              if (C.se     >= 0) { setClauses.push('side_effects = ?');setVals.push(cell(row, C.se).substring(0, 1000)); }
              if (C.mrp    >= 0) { setClauses.push('mrp = ?');         setVals.push(mrpRaw); }
              if (C.price  >= 0) { setClauses.push('price = ?');       setVals.push(priceRaw); }
              if (C.stock  >= 0) { setClauses.push('stock = ?');       setVals.push(parseInt(cell(row, C.stock)) || 0); }
              if (C.pack   >= 0) { setClauses.push('pack = ?');        setVals.push(cell(row, C.pack).substring(0, 100)); }
              if (C.code   >= 0) { setClauses.push('code = ?');        setVals.push(cell(row, C.code).substring(0, 50)); }
              if (C.batch  >= 0) { setClauses.push('batch_number = ?');setVals.push(cell(row, C.batch).substring(0, 100)); }
              if (C.rx     >= 0) { setClauses.push('requires_prescription = ?'); setVals.push(requiresRx); }
              if (C.active >= 0 || C.disc >= 0) { setClauses.push('is_active = ?'); setVals.push(isActive); }
              if (C.type   >= 0) {
                setClauses.push('category_id = ?'); setVals.push(catId);
                setClauses.push('secondary_category_ids = ?'); setVals.push(secondaryJson);
              }
              setVals.push(rowId);
              await execute(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`, setVals);
              updated++;
              continue;
            }
            // id not found → fall through to insert
          }

          // ── INSERT new product ───────────────────────────────────────────
          insertValues.push([
            cell(row, C.code).substring(0, 50),
            name,
            makeSlug(name, rowIdx),
            catId,
            cell(row, C.brand).substring(0, 100),
            cell(row, C.desc) || null,
            cell(row, C.pack).substring(0, 100),
            mrpRaw,
            priceRaw,
            parseInt(cell(row, C.stock)) || 0,
            requiresRx,
            null,       // images_json
            null,       // expiry_date
            cell(row, C.batch).substring(0, 100) || '',
            cell(row, C.salt).substring(0, 500),
            cell(row, C.se).substring(0, 1000),
            isActive,
            0,          // is_deleted
            secondaryJson, // secondary_category_ids
          ]);
        }

        if (insertValues.length) {
          await query(
            `INSERT IGNORE INTO products
              (code,name,slug,category_id,brand,description,pack,
               mrp,price,stock,requires_prescription,images_json,
               expiry_date,batch_number,salt,side_effects,is_active,is_deleted,
               secondary_category_ids)
             VALUES ?`,
            [insertValues]
          );
          inserted += insertValues.length;
        }
      }

      res.json({ mode, inserted, updated, skipped, total: rows.length });
    } catch (err) { next(err); }
  }
);

// ── AI Fill Routes ──────────────────────────────────────────────────────────
router.post('/ai-fill', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const productId = req.body.productId;
    if (!productId) return res.status(400).json({ message: 'Missing productId' });

    const pRow = await query('SELECT p.id, p.name, p.brand, c.name as category FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?', [productId]);
    if (!pRow.length) return res.status(404).json({ message: 'Product not found' });
    const p = pRow[0];

    const { salt, description } = await geminiAutoFill(p.name, p.brand, p.category);
    
    await execute('UPDATE products SET salt = ?, description = ? WHERE id = ?', [salt, description, productId]);
    
    res.json({ success: true, salt, description });
  } catch (err) {
    if (err.message.includes('GEMINI_API_KEY')) return res.status(503).json({ message: 'Gemini API Key missing.' });
    if (err.message.includes('429') || err.message.includes('quota') || err.message.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({ message: 'AI quota exhausted for today. The free-tier daily limit has been reached. Please try again tomorrow or upgrade the Gemini API plan.' });
    }
    next(err);
  }
});

router.post('/ai-fill-bulk', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const ids = req.body.productIds; // Array of IDs
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'Missing productIds array' });

    // Limit batch size to prevent timeouts
    const batch = ids.slice(0, 50); 
    const results = [];

    // Process sequentially to be gentle on rate limits, or small parallel batches
    for (const id of batch) {
      try {
        const pRow = await query('SELECT p.id, p.name, p.brand, c.name as category FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?', [id]);
        if (!pRow.length) {
          results.push({ _id: id, success: false, error: 'Not found' });
          continue;
        }
        const p = pRow[0];
        const { salt, description } = await geminiAutoFill(p.name, p.brand, p.category);
        await execute('UPDATE products SET salt = ?, description = ? WHERE id = ?', [salt, description, id]);
        results.push({ _id: id, success: true, salt, description });
        
        // Brief delay between calls to respect rate limits
        await new Promise(r => setTimeout(r, 1000)); 
      } catch (err) {
        results.push({ _id: id, success: false, error: err.message });
      }
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

router.get('/ai-test-models', requireAuth, requireAdmin, async (req, res) => {
  try {
     const { salt, description } = await geminiAutoFill('Dolo 650', 'Micro Labs', 'Medicine');
     res.json({ success: true, salt, description, message: 'AI models working correctly.' });
  } catch (err) {
     res.status(500).json({ message: err.message });
  }
});

router.get('/:slug', [param('slug').trim().isLength({ min: 1, max: 220 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const rows = await query(
      `SELECT p.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = ? AND p.is_deleted = 0 AND p.is_active = 1 LIMIT 1`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ message: 'Product not found.' });

    const product = mapProduct(rows[0]);

    // Attach brand media if product has a brand
    if (rows[0].brand) {
      const brandRows = await query(
        'SELECT media_json FROM brands WHERE name = ? AND is_active = 1 LIMIT 1',
        [rows[0].brand]
      );
      if (brandRows.length && brandRows[0].media_json) {
        try {
          const raw = brandRows[0].media_json;
          product.brandMedia = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch { product.brandMedia = []; }
      }
    }

    res.json(product);
  } catch (err) { next(err); }
});

// ── Related products ────────────────────────────────────────────────────────
router.get('/:id/related', [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const productId = Number(req.params.id);
    const rows = await query('SELECT brand, category_id FROM products WHERE id = ? AND is_deleted = 0 LIMIT 1', [productId]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found.' });

    const { brand, category_id } = rows[0];
    const promises = [];

    // Fisher-Yates shuffle — runs in Node.js, avoids ORDER BY RAND() full-table scan in MySQL
    function shuffleArr(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    // Brand-related: fetch 30 recent by PK order (fast index scan), shuffle in JS
    if (brand) {
      promises.push(
        query(
          `SELECT p.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.brand = ? AND p.id <> ? AND p.is_deleted = 0 AND p.is_active = 1
           ORDER BY p.created_at DESC LIMIT 30`,
          [brand, productId]
        )
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    // Category-related: same approach — 30 recent, JS-shuffled
    if (category_id) {
      promises.push(
        query(
          `SELECT p.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.category_id = ? AND p.id <> ? AND p.is_deleted = 0 AND p.is_active = 1
           ORDER BY p.created_at DESC LIMIT 30`,
          [category_id, productId]
        )
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    const [brandRows, categoryRows] = await Promise.all(promises);

    // Shuffle in JS then trim to 10 each
    shuffleArr(brandRows);
    shuffleArr(categoryRows);

    // Deduplicate: remove from category list any that appear in brand list
    const brandIds = new Set(brandRows.map(r => r.id));
    const dedupedCategory = categoryRows.filter(r => !brandIds.has(r.id));

    res.json({
      brandRelated:    brandRows.slice(0, 10).map(mapProduct),
      categoryRelated: dedupedCategory.slice(0, 10).map(mapProduct),
    });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireAdmin, auditLogger('CREATE_PRODUCT', 'Product'), [
  body('name').trim().notEmpty().isLength({ max: 200 }),
  body('category').isInt({ min: 1 }),
  body('brand').optional().trim().isLength({ max: 100 }),
  body('company').optional().trim().isLength({ max: 150 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('salt').optional().trim().isLength({ max: 500 }),
  body('mrp').isFloat({ min: 0 }),
  body('price').isFloat({ min: 0 }),
  body('stock').isInt({ min: 0 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const slugBase = slugify(req.body.name);
    let slug = slugBase;
    let suffix = 2;
    while ((await query('SELECT id FROM products WHERE slug = ? LIMIT 1', [slug])).length) {
      slug = `${slugBase}-${suffix}`;
      suffix += 1;
    }

    const imageUrls = [];

    const result = await execute(
      `INSERT INTO products
        (code, name, slug, category_id, brand, company, description, pack, mrp, price, stock, requires_prescription,
         images_json, expiry_date, batch_number, salt, side_effects, secondary_category_ids, video_url, is_active, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        req.body.code || '',
        req.body.name.trim(),
        slug,
        Number(req.body.category),
        req.body.brand || '',
        req.body.company || '',
        req.body.description || '',
        req.body.pack || '',
        Number(req.body.mrp),
        Number(req.body.price),
        Number(req.body.stock),
        req.body.requiresPrescription === true || req.body.requiresPrescription === 'true' ? 1 : 0,
        JSON.stringify(imageUrls),
        req.body.expiryDate || null,
        req.body.batchNumber || '',
        req.body.salt || '',
        req.body.sideEffects || '',
        JSON.stringify(Array.isArray(req.body.secondaryCategoryIds) ? req.body.secondaryCategoryIds.map(Number).filter(Boolean) : []),
        req.body.videoUrl || null,
      ]
    );

    const rows = await query(
      `SELECT p.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ? LIMIT 1`,
      [result.insertId]
    );
    res.status(201).json(mapProduct(rows[0]));
  } catch (err) { next(err); }
});

router.put('/:id', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], auditLogger('UPDATE_PRODUCT', 'Product'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const rows = await query('SELECT * FROM products WHERE id = ? AND is_deleted = 0 LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found.' });

    const current = rows[0];
    req._auditBefore = mapProduct({ ...current, category_name: null, category_slug: null });

    const nextName = req.body.name !== undefined ? String(req.body.name).trim() : current.name;
    let nextSlug = current.slug;
    if (nextName !== current.name) {
      const slugBase = slugify(nextName);
      nextSlug = slugBase;
      let suffix = 2;
      while ((await query('SELECT id FROM products WHERE slug = ? AND id <> ? LIMIT 1', [nextSlug, req.params.id])).length) {
        nextSlug = `${slugBase}-${suffix}`;
        suffix += 1;
      }
    }

    await execute(
      `UPDATE products SET
        code = ?, name = ?, slug = ?, category_id = ?, brand = ?, company = ?, description = ?, pack = ?,
        mrp = ?, price = ?, stock = ?, requires_prescription = ?, expiry_date = ?,
        batch_number = ?, salt = ?, side_effects = ?, is_active = ?, secondary_category_ids = ?, video_url = ?
       WHERE id = ?`,
      [
        req.body.code !== undefined ? req.body.code : current.code,
        nextName,
        nextSlug,
        req.body.category !== undefined ? Number(req.body.category) : current.category_id,
        req.body.brand !== undefined ? req.body.brand : current.brand,
        req.body.company !== undefined ? req.body.company : (current.company || ''),
        req.body.description !== undefined ? req.body.description : current.description,
        req.body.pack !== undefined ? req.body.pack : current.pack,
        req.body.mrp !== undefined ? Number(req.body.mrp) : Number(current.mrp),
        req.body.price !== undefined ? Number(req.body.price) : Number(current.price),
        req.body.stock !== undefined ? Number(req.body.stock) : Number(current.stock),
        req.body.requiresPrescription !== undefined
          ? (req.body.requiresPrescription === true || req.body.requiresPrescription === 'true' ? 1 : 0)
          : current.requires_prescription,
        req.body.expiryDate !== undefined ? req.body.expiryDate || null : current.expiry_date,
        req.body.batchNumber !== undefined ? req.body.batchNumber : current.batch_number,
        req.body.salt !== undefined ? req.body.salt : current.salt,
        req.body.sideEffects !== undefined ? req.body.sideEffects : current.side_effects,
        req.body.isActive !== undefined ? (req.body.isActive === true || req.body.isActive === 'true' ? 1 : 0) : current.is_active,
        req.body.secondaryCategoryIds !== undefined
          ? JSON.stringify(Array.isArray(req.body.secondaryCategoryIds) ? req.body.secondaryCategoryIds.map(Number).filter(Boolean) : [])
          : (current.secondary_category_ids || null),
        req.body.videoUrl !== undefined ? (req.body.videoUrl || null) : (current.video_url || null),
        req.params.id,
      ]
    );

    const updated = await query(
      `SELECT p.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ? LIMIT 1`,
      [req.params.id]
    );
    res.json(mapProduct(updated[0]));
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], auditLogger('DELETE_PRODUCT', 'Product'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const rows = await query('SELECT * FROM products WHERE id = ? AND is_deleted = 0 LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found.' });

    req._auditBefore = mapProduct({ ...rows[0], category_name: null, category_slug: null });
    await execute('UPDATE products SET is_deleted = 1, is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted.' });
  } catch (err) { next(err); }
});

// ── Dedicated image management (add / remove) ────────────────────────────────
// Uses a unique path to avoid cPanel/Passenger routing issues
router.post('/update-images/:id', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  console.log('[update-images] id=%s body=%j', req.params.id, req.body);
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const rows = await query('SELECT id, images_json FROM products WHERE id = ? AND is_deleted = 0 LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found.' });

    // Read current images safely (handle both string and auto-parsed array)
    let images = [];
    const raw = rows[0].images_json;
    if (Array.isArray(raw)) images = raw;
    else if (typeof raw === 'string' && raw.trim()) try { images = JSON.parse(raw); } catch { images = []; }
    // Normalize & drop Cloudinary links
    images = Array.isArray(images) ? images.filter((u) => typeof u === 'string').map((u) => u.trim()).filter((u) => u && !isCloudinaryUrl(u)) : [];
    const currentImages = [...images];

    const replaceMode = req.body.mode === 'replace' || req.body.replace === true || req.body.clearExisting === true;
    if (replaceMode) images = [];

    // Remove specified images
    let removeList = [];
    if (req.body.removeImages) {
      let toRemove = req.body.removeImages;
      if (typeof toRemove === 'string') try { toRemove = JSON.parse(toRemove); } catch { toRemove = []; }
      if (Array.isArray(toRemove) && toRemove.length) removeList = toRemove;
    }
    if (replaceMode && currentImages.length) removeList = [...new Set([...removeList, ...currentImages])];
    if (removeList.length) {
      images = images.filter(u => !removeList.includes(u));
    }

    // Add image by URL (prepend so it shows first)
    const isValidImageUrl = (u) => (/^https?:\/\//i.test(u) || u.startsWith('/uploads/')) && !isCloudinaryUrl(u);
    if (req.body.imageUrl && isValidImageUrl(String(req.body.imageUrl).trim())) {
      images.unshift(String(req.body.imageUrl).trim());
    }

    // Add multiple image URLs
    if (req.body.imageUrls) {
      let urls = req.body.imageUrls;
      if (typeof urls === 'string') try { urls = JSON.parse(urls); } catch { urls = []; }
      if (Array.isArray(urls)) {
        urls.filter(u => isValidImageUrl(String(u || '').trim())).forEach(u => images.unshift(String(u).trim()));
      }
    }

    images = [...new Set(images.map(u => String(u).trim()).filter(Boolean).filter((u) => !isCloudinaryUrl(u)))].slice(0, 5);

    await execute('UPDATE products SET images_json = ? WHERE id = ?', [JSON.stringify(images), req.params.id]);
    res.json({ images });
  } catch (err) { next(err); }
});

router.patch('/:id/quick-update', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const rows = await query('SELECT * FROM products WHERE id = ? AND is_deleted = 0 LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found.' });
    const current = rows[0];

    await execute('UPDATE products SET stock = ?, is_active = ? WHERE id = ?', [
      req.body.stock !== undefined ? Math.max(0, parseInt(req.body.stock, 10)) : current.stock,
      req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : current.is_active,
      req.params.id,
    ]);

    const updated = await query(
      `SELECT p.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ? LIMIT 1`,
      [req.params.id]
    );
    res.json(mapProduct(updated[0]));
  } catch (err) { next(err); }
});

router.patch('/bulk-update', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { ids, update = {}, applyToAll = false, filterParams = {} } = req.body;
    let modified = 0;

    const setParts = [];
    const values = [];

    if (update.stock !== undefined) {
      setParts.push('p.stock = ?');
      values.push(Math.max(0, Number(update.stock)));
    }
    if (update.isActive !== undefined) {
      setParts.push('p.is_active = ?');
      values.push(update.isActive ? 1 : 0);
    }
    if (update.isDeleted !== undefined) {
      setParts.push('p.is_deleted = ?');
      values.push(update.isDeleted ? 1 : 0);
      if (update.isDeleted) {
        setParts.push('p.is_active = 0');
      }
    }
    if (!setParts.length) return res.status(400).json({ message: 'Nothing to update.' });

    if (applyToAll) {
      // Safety guard: require at least one meaningful filter to prevent accidental mass updates
      const hasMeaningfulFilter = filterParams.category || filterParams.search || filterParams.brand
        || filterParams.status || filterParams.stockFilter;
      if (!hasMeaningfulFilter) {
        return res.status(422).json({
          message: 'applyToAll requires at least one filter (category, search, brand, status, or stockFilter) to prevent unintended mass updates.',
        });
      }
      const categoryIds = await resolveCategoryIds(filterParams.category);
      const { whereSql, values: whereValues } = buildProductWhere({ admin: true, params: filterParams, categoryIds: categoryIds || [] });
      // Direct update using the same WHERE clause
      const result = await execute(
        `UPDATE products p SET ${setParts.join(', ')} ${whereSql}`,
        [...values, ...whereValues]
      );
      modified = result.affectedRows || 0;
    } else {
      const targetIds = Array.isArray(ids) ? ids.map((id) => Number(id)).filter(Boolean) : [];
      if (!targetIds.length) return res.json({ message: 'Bulk update complete.', modified: 0 });

      // Process in chunks to avoid max_allowed_packet or timeout
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < targetIds.length; i += CHUNK_SIZE) {
        const chunk = targetIds.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '?').join(', ');
        const result = await execute(
          `UPDATE products p SET ${setParts.join(', ')} WHERE p.id IN (${placeholders})`,
          [...values, ...chunk]
        );
        modified += (result.affectedRows || 0);
      }
    }

    res.json({ message: 'Bulk update complete.', modified });
  } catch (err) { next(err); }
});

router.patch('/bulk-discount', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { ids, discountPct, applyToAll = false, filterParams = {} } = req.body;
    const pct = Number(discountPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(422).json({ message: 'discountPct must be a number between 0 and 100.' });
    }

    // Use a JS number (not .toFixed string) so MySQL receives a proper numeric parameter
    const multiplier = (100 - pct) / 100;
    let modified = 0;

    if (applyToAll) {
      // Safety guard: require at least one meaningful filter to prevent accidental mass price changes
      // Exception: 0% discount (reset to MRP) is always safe — multiplier = 1.0
      const hasMeaningfulFilter = filterParams.category || filterParams.search || filterParams.brand
        || (filterParams.status && filterParams.status !== 'all')
        || (filterParams.stockFilter && filterParams.stockFilter !== 'all');
      if (!hasMeaningfulFilter && pct !== 0) {
        return res.status(422).json({
          message: 'applyToAll requires at least one filter (category, search, brand, status, or stockFilter) to prevent mass price changes.',
        });
      }
      const categoryIds = await resolveCategoryIds(filterParams.category);
      const { whereSql, values } = buildProductWhere({ admin: true, params: filterParams, categoryIds: categoryIds || [] });
      // Use query() (pool.query, NOT prepared statement execute) for arithmetic UPDATE
      const result = await query(
        `UPDATE products p SET p.price = ROUND(p.mrp * ?, 2) ${whereSql}`,
        [multiplier, ...values]
      );
      modified = result.affectedRows || 0;
    } else {
      const targetIds = Array.isArray(ids) ? ids.map((id) => Number(id)).filter(Boolean) : [];
      if (!targetIds.length) return res.json({ message: 'Discount applied. 0 products updated.', modified: 0 });

      const CHUNK_SIZE = 500;
      for (let i = 0; i < targetIds.length; i += CHUNK_SIZE) {
        const chunk = targetIds.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '?').join(', ');
        const result = await query(
          `UPDATE products p SET p.price = ROUND(p.mrp * ?, 2) WHERE p.id IN (${placeholders})`,
          [multiplier, ...chunk]
        );
        modified += (result.affectedRows || 0);
      }
    }

    res.json({ message: `Discount applied. ${modified} products updated.`, modified });
  } catch (err) { next(err); }
});

module.exports = router;