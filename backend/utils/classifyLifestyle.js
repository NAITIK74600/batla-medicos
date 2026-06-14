'use strict';

/**
 * classifyLifestyle(name, brand, salt)
 *
 * Determines the single best "lifestyle category" slug for a product by
 * testing the combined text (name + brand + salt_composition) against
 * prioritised rule-sets.
 *
 * Returns one of:
 *   'sexual-wellness' | 'oral-care' | 'women-care' | 'men-grooming' | 'elderly-care' |
 *   'skin-care' | 'hair-care' | 'baby-care' |
 *   'fitness-health'  | 'vitamins-nutrition' | 'diabetes-care' |
 *   'supports-braces' | null
 *
 * null means the product does not fit a lifestyle page — it stays in its
 * dosage-form category (allopathic, ayurvedic, etc.) only.
 *
 * Rules are ordered by specificity — the first match wins.
 * Keep this file as the single source of truth so the import pipeline,
 * migration script, and the products route all use the same logic.
 */

// Each rule is [slug, testFn].
// testFn receives the lowercased concatenated text and returns true/false.
const RULES = [
  // ── Sexual Wellness ────────────────────────────────────────────────────────
  ['sexual-wellness', (t) =>
    /\b(condom|manforce|durex|kamasutra|moods|skore|notyet|playgard|kohinoor|bleu|okamoto|sensation|contempo|trojan)\b/.test(t) ||
    /\b(sildenafil|tadalafil|vardenafil|avanafil|dapoxetine)\b/.test(t) ||
    /\b(contraceptive|oral pill|emergency pill|ipill|i-pill|unwanted|mifepristone|levonorgestrel|ulipristal)\b/.test(t) ||
    /\b(intimate|lubricant|lubricating gel|vaginal|kamagra|vigora|suhagra|caverta)\b/.test(t) ||
    /\b(erectile|sexual wellness|spermicide|female arousal|sex delay|delay spray|dotted condom|ultra thin condom|flavoured condom)\b/.test(t)
  ],

  // ── Oral Care ─────────────────────────────────────────────────────────────
  ['oral-care', (t) =>
    /\b(toothpaste|tooth paste|toothbrush|tooth brush|tooth powder|tooth gel|mouthwash|mouth wash|mouth rinse|dental floss|tongue cleaner|gum care|gum gel|gum paint|whitening strip)\b/.test(t) ||
    /\b(colgate|sensodyne|pepsodent|closeup|close.?up|oral.?b|dabur red|himalaya toothpaste|listerine|meswak|promise tooth|spinbrush|himalaya gum|vicco vajradanti|patanjali dant)\b/.test(t) ||
    /\b(gingivitis|plaque|tartar|fluoride|cavity protection|caries|enamel protect|mouth ulcer gel|stomatitis gel|clove oil dental|orajel)\b/.test(t)
  ],

  // ── Women Care ────────────────────────────────────────────────────────────
  ['women-care', (t) =>
    /\b(sanitary pad|sanitary napkin|panty liner|tampon|menstrual cup|feminine hygiene|vaginal wash|intimate wash|women hygiene|period pain)\b/.test(t) ||
    /\b(pcod|pcos|menstruation|menorrhagia|dysmenorrhea|amenorrhea|endometriosis|leucorrhoea|white discharge|uterine|ovarian cyst)\b/.test(t) ||
    /\b(pregnancy test|ovulation kit|prenatal vitamin|iron folic|lactation|breastfeeding|breast pump|maternity|postpartum)\b/.test(t) ||
    /\b(sofy|whisper pad|stayfree|carefree pad|everteen|v wash|lactacyd|episoft|gynaecosid|regestrone|primolut|provera|duphaston|dienogest)\b/.test(t) ||
    /\b(female hormone|progesterone|estrogen|oestrogen|norethisterone|ethinyl estradiol|clomiphene|letrozole|gynaecology)\b/.test(t)
  ],

  // ── Men Grooming ─────────────────────────────────────────────────────────
  ['men-grooming', (t) =>
    /\b(shaving cream|shaving foam|shaving gel|shaving brush|after.?shave|razor blade|razor cartridge|pre.?shave)\b/.test(t) ||
    /\b(beard oil|beard balm|beard wax|beard conditioner|beard serum|beard growth|moustache|mustache wax)\b/.test(t) ||
    /\b(brylcreem|gillette shav|park avenue shav|old spice shav|fogg men|axe deo men|wildstone|denver deo|engage men|beardo|ustraa|man arden|bombay shaving)\b/.test(t) ||
    /\b(men.?s face wash|men.?s grooming|men moisturizer|men deodorant|men body wash|men talc|men perfume)\b/.test(t)
  ],

  // ── Baby Care ──────────────────────────────────────────────────────────────
  // Check before skin/hair so baby lotion/powder doesn't leak out
  ['baby-care', (t) =>
    /\b(baby|infant|newborn|neonatal|pediatric|paediatric)\b/.test(t) ||
    /\b(cerelac|lactogen|nan pro|similac|pediasure|enfamil|aptamil)\b/.test(t) ||
    /\b(feeding bottle|pacifier|diaper|nappy|teether|gripe water)\b/.test(t) ||
    /\b(johnson baby|himalaya baby|mother sparsh)\b/.test(t)
  ],

  // ── Skin Care ──────────────────────────────────────────────────────────────
  ['skin-care', (t) =>
    /\b(sunscreen|spf|uv protect|sun protect|sunblock)\b/.test(t) ||
    /\b(face wash|facewash|face scrub|face pack|face mask|face serum)\b/.test(t) ||
    /\b(moisturizer|moisturiser|moisturising|moisturizing)\b/.test(t) ||
    /\b(anti.?aging|anti.?ageing|wrinkle|dark spot|pigmentation|skin whitening|skin brightening|fairness)\b/.test(t) ||
    /\b(toner|essence|retinol|niacinamide|hyaluronic|vitamin c serum|kojic)\b/.test(t) ||
    /\b(acne|pimple|blackhead|whitehead|salicylic|benzoyl peroxide|sebum)\b/.test(t) ||
    /\b(derma|dermology|skinceuticals|cetaphil|lacto calamine|mamaearth face|wow face|plum face)\b/.test(t)
  ],

  // ── Hair Care ──────────────────────────────────────────────────────────────
  ['hair-care', (t) =>
    /\b(shampoo|conditioner|hair serum|hair mask|hair spray|hair cream)\b/.test(t) ||
    /\b(dandruff|scalp|anti.?dandruff|ketoconazole shampoo|zinc pyrithione)\b/.test(t) ||
    /\b(hairfall|hair fall|hair loss|alopecia|minoxidil|finasteride|hair growth)\b/.test(t) ||
    /\b(hair oil|amla oil|argan oil|bhringraj|onion hair)\b/.test(t) ||
    /\b(tresemme|pantene|head.?shoulders|dove shampoo|clinic plus|himalaya hair)\b/.test(t)
  ],

  // ── Diabetes Care ──────────────────────────────────────────────────────────
  ['diabetes-care', (t) =>
    /\b(insulin|metformin|glipizide|glibenclamide|gliclazide|glimepiride|voglibose|sitagliptin|empagliflozin|dapagliflozin|canagliflozin)\b/.test(t) ||
    /\b(glucometer|glucose meter|lancet|test strip|glucose monitor|accu.?chek|onetouch|freestyle)\b/.test(t) ||
    /\b(diabetic|diabetes|anti.?diabetic|hyperglycemia|blood sugar|glycemic)\b/.test(t) ||
    /\b(sugar free|sugarfree|nutrasweet)\b/.test(t)
  ],

  // ── Vitamins & Nutrition ───────────────────────────────────────────────────
  ['vitamins-nutrition', (t) =>
    /\b(multivitamin|multi vitamin|vitamin [a-e]|vitamin b12|vitamin c tablet|vitamin d3|vitamin d tab|calcium tablet|iron tablet|folic acid|biotin|zinc tablet|magnesium|omega.?3)\b/.test(t) ||
    /\b(whey protein|protein powder|mass gainer|casein|bcaa|amino acid supplement|creatine)\b/.test(t) ||
    /\b(health supplement|nutritional supplement|dietary supplement|nutraceutical)\b/.test(t) ||
    /\b(complan|horlicks|bournvita|ensure|protinex|pediasure|boost drink)\b/.test(t) ||
    /\b(revital|supradyn|centrum|limcee|becosules|neurobion|calci)\b/.test(t)
  ],

  // ── Immunity Boosters ─────────────────────────────────────────────────────
  ['immunity-boosters', (t) =>
    /\b(chyawanprash|chyavanprash|giloy|guduchi)\b/.test(t) ||
    /\b(immunity booster|immune booster|immune support|immunoboost)\b/.test(t)
  ],

  // ── Fitness & Health ───────────────────────────────────────────────────────
  ['fitness-health', (t) =>
    /\b(gym|workout|pre.?workout|post.?workout|energy booster|stamina|endurance)\b/.test(t) ||
    /\b(testosterone|libido booster|ashwagandha capsule|shilajit|tribulus)\b/.test(t) ||
    /\b(muscle|bodybuilding|fat burner|weight loss capsule|slimming|thermogenic)\b/.test(t)
  ],

  // ── Elderly Care ──────────────────────────────────────────────────────────
  ['elderly-care', (t) =>
    // Adult incontinence / diapers
    /\b(adult diaper|adult absorbent|adult brief|adult pant|adult pad|incontinence pad|incontinence brief|pull up adult|pant style adult|slip adult)\b/.test(t) ||
    /\b(friends easy|friends premium|dignity adult|assure adult|tena adult|tena slip|dry comfy adult|bodycare adult|softmates adult|freedom adult|comfort adult diaper)\b/.test(t) ||
    // Bedsore / pressure sore management
    /\b(bedsore|bed sore|pressure sore|pressure ulcer|decubitus|anti.?decubitus|heel protector|heel guard|elbow protector)\b/.test(t) ||
    // Geriatric keywords
    /\b(geriatric|elderly care|senior citizen|old age care|ageing care|age care supplement)\b/.test(t) ||
    // Hearing
    /\b(hearing aid|hearing care|hearing loss|auditory care|audiocal|ear machine)\b/.test(t) ||
    // Mobility & positioning (not covered by supports-braces brands above)
    /\b(toilet seat raiser|toilet riser|commode seat|grab bar|bed rail|patient lifter|transfer belt|gait belt|turning sheet)\b/.test(t)
  ],

  // ── Supports & Braces ──────────────────────────────────────────────────────
  ['supports-braces', (t) =>
    /\b(knee cap|knee brace|knee support|ankle support|wrist support|elbow support|shoulder support|back support|lumbar support|cervical collar|neck brace)\b/.test(t) ||
    /\b(orthopaedic|orthopedic support|splint|compression stocking|crepe bandage)\b/.test(t) ||
    /\b(walker|crutch|wheelchair|bed pan|commode|nebulizer|oximeter pulse|bp monitor|blood pressure monitor)\b/.test(t)
  ],
];

/**
 * @param {string} name
 * @param {string} brand
 * @param {string} salt  - salt_composition / short_composition
 * @returns {string|null}
 */
function classifyLifestyle(name = '', brand = '', salt = '') {
  // Build a single lowercased text blob to test against
  const text = `${name} ${brand} ${salt}`.toLowerCase();

  for (const [slug, test] of RULES) {
    if (test(text)) return slug;
  }
  return null; // not a lifestyle product
}

module.exports = { classifyLifestyle };
