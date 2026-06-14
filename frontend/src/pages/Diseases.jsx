import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';

const DISEASES = [
  // A
  { name: 'Acidity',               letter: 'A', desc: 'Acidity is one of the most common ailments. It occurs when gastric glands produce excess acid, causing a burning sensation in the stomach and chest.', search: 'pantoprazole' },
  { name: 'Acne',                  letter: 'A', desc: 'Acne is a skin condition that occurs when hair follicles plug with oil and dead skin cells, leading to pimples, blackheads or whiteheads.', search: 'clindamycin' },
  { name: 'Allergic Conditions',   letter: 'A', desc: 'Allergies are caused when the body\'s immune system reacts to a foreign substance, causing symptoms like sneezing, itching, rashes, or swelling.', search: 'cetirizine' },
  { name: 'Anemia',                letter: 'A', desc: 'Anemia is a condition in which you lack enough healthy red blood cells to carry adequate oxygen to body tissues, causing fatigue and weakness.', search: 'ferrous sulphate' },
  { name: 'Anxiety',               letter: 'A', desc: 'Anxiety disorders involve excessive worry and fear. They can manifest as panic attacks, phobias, or generalised anxiety affecting daily life.', search: 'alprazolam' },
  { name: 'Arthritis',             letter: 'A', desc: 'Arthritis is inflammation of one or more joints, causing pain and stiffness that can worsen with age. The most common types are osteoarthritis and rheumatoid arthritis.', search: 'diclofenac' },
  { name: 'Asthma',                letter: 'A', desc: 'Asthma is a condition affecting the airways in the lungs. Airways become inflamed and can narrow, causing wheezing, breathlessness, and coughing.', search: 'salbutamol' },
  // B
  { name: 'Back Pain',             letter: 'B', desc: 'Back pain is one of the most common reasons people seek medical care. It can range from a dull ache to a sharp, shooting pain down the leg.', search: 'diclofenac' },
  { name: 'Blood Pressure (High)', letter: 'B', desc: 'High blood pressure (hypertension) is a common condition where the force of blood against artery walls is too high, increasing risk of heart disease.', search: 'amlodipine' },
  { name: 'Bronchitis',            letter: 'B', desc: 'Bronchitis is an inflammation of bronchial tube lining. It causes coughing that often brings up thickened mucus and can be acute or chronic.', search: 'ambroxol' },
  // C
  { name: 'Cold & Flu',            letter: 'C', desc: 'The common cold is a viral infection of the nose and throat. It is usually harmless, although symptoms like runny nose and sore throat are unpleasant.', search: 'paracetamol' },
  { name: 'Constipation',          letter: 'C', desc: 'Constipation occurs when bowel movements become less frequent and stools become difficult to pass. It is often caused by changes in diet or activity.', search: 'lactulose' },
  { name: 'Cough',                 letter: 'C', desc: 'A cough is a reflex action to clear the throat of mucus, irritants, and microbes. Persistent cough may indicate an underlying respiratory condition.', search: 'dextromethorphan' },
  // D
  { name: 'Dandruff',              letter: 'D', desc: 'Dandruff is a common scalp condition that causes white or grey flakes of dead skin to appear in the hair or on shoulders.', search: 'ketoconazole' },
  { name: 'Depression',            letter: 'D', desc: 'Depression is a mood disorder causing persistent feelings of sadness, loss of interest, and difficulty carrying out everyday activities.', search: 'escitalopram' },
  { name: 'Diabetes',              letter: 'D', desc: 'Diabetes is a disease that occurs when blood glucose is too high. Over time, it can cause serious health problems including heart disease and kidney damage.', search: 'metformin' },
  { name: 'Diarrhea',              letter: 'D', desc: 'Diarrhea is loose, watery stools occurring three or more times a day. It may be caused by bacteria, viruses, medications, or certain foods.', search: 'metronidazole' },
  // E
  { name: 'Eczema',                letter: 'E', desc: 'Eczema (atopic dermatitis) is a condition that makes skin red and itchy. It is common in children but can occur at any age and tends to flare periodically.', search: 'betamethasone' },
  { name: 'Eye Infection',         letter: 'E', desc: 'Eye infections occur when harmful microorganisms invade the eyeball or surrounding tissues, causing redness, discharge, and discomfort.', search: 'ciprofloxacin' },
  // F
  { name: 'Fever',                 letter: 'F', desc: 'Fever is a temporary increase in body temperature, often due to an illness. It is a sign the body is fighting an infection and usually resolves with rest.', search: 'paracetamol' },
  { name: 'Fungal Infection',      letter: 'F', desc: 'Fungal infections are caused by fungi and can affect the skin, nails, mouth, and other body parts. They are most common in warm, moist areas.', search: 'clotrimazole' },
  // G
  { name: 'Gastritis',             letter: 'G', desc: 'Gastritis is inflammation, irritation, or erosion of the stomach lining. It can occur suddenly (acute gastritis) or gradually (chronic gastritis).', search: 'omeprazole' },
  { name: 'GERD',                  letter: 'G', desc: 'Gastroesophageal reflux disease (GERD) is a digestive disorder where stomach acid frequently flows back into the esophagus, causing heartburn and irritation.', search: 'rabeprazole' },
  // H
  { name: 'Headache',              letter: 'H', desc: 'A headache is pain or discomfort in the head, scalp, or neck. Tension headaches are the most common type, often triggered by stress or poor posture.', search: 'ibuprofen' },
  { name: 'Heart Disease',         letter: 'H', desc: 'Heart disease describes a range of conditions affecting the heart, including coronary artery disease, arrhythmias, and heart defects.', search: 'atorvastatin' },
  { name: 'Hypertension',          letter: 'H', desc: 'Hypertension is a chronic condition of consistently elevated blood pressure. It is a major risk factor for stroke, heart attack, and kidney failure.', search: 'amlodipine' },
  // I
  { name: 'Indigestion',           letter: 'I', desc: 'Indigestion (dyspepsia) is discomfort or pain in the upper abdomen. It often occurs after eating and may be accompanied by bloating and nausea.', search: 'domperidone' },
  { name: 'Insomnia',              letter: 'I', desc: 'Insomnia is a sleep disorder where you have trouble falling or staying asleep. It can drain energy, affect mood, and impact work performance.', search: 'zolpidem' },
  // J
  { name: 'Jaundice',              letter: 'J', desc: 'Jaundice is a yellowing of skin and eyes caused by a high level of bilirubin in the blood, often indicating liver, bile duct, or blood problems.', search: 'ursodeoxycholic' },
  { name: 'Joint Pain',            letter: 'J', desc: 'Joint pain is discomfort, aches, and soreness in any body joint. It is extremely common and does not always require a hospital visit.', search: 'diclofenac' },
  // K
  { name: 'Kidney Stones',         letter: 'K', desc: 'Kidney stones are hard deposits of minerals and salts that form inside kidneys. They are painful to pass but rarely cause permanent damage if caught early.', search: 'tamsulosin' },
  // L
  { name: 'Liver Disease',         letter: 'L', desc: 'Liver disease refers to any condition damaging the liver and affecting its function. It includes hepatitis, fatty liver, cirrhosis, and liver cancer.', search: 'silymarin' },
  { name: 'Low Blood Pressure',    letter: 'L', desc: 'Low blood pressure (hypotension) occurs when blood pressure is lower than normal. It can cause dizziness, fainting, and in severe cases, shock.', search: 'fludrocortisone' },
  // M
  { name: 'Malaria',               letter: 'M', desc: 'Malaria is a life-threatening disease caused by parasites transmitted through bites of infected female Anopheles mosquitoes. It is preventable and treatable.', search: 'chloroquine' },
  { name: 'Migraine',              letter: 'M', desc: 'A migraine is a severe headache causing throbbing pain, usually on one side of the head. It is often accompanied by nausea and sensitivity to light.', search: 'sumatriptan' },
  { name: 'Mouth Ulcer',           letter: 'M', desc: 'Mouth ulcers are painful sores inside the mouth on cheeks, lips, or tongue. They are mostly harmless but can make eating, drinking, and talking uncomfortable.', search: 'triamcinolone' },
  { name: 'Muscle Pain',           letter: 'M', desc: 'Muscle pain (myalgia) is extremely common and affects people of all ages. Pain can be localised or widespread, and may be caused by overuse or injury.', search: 'diclofenac' },
  // N
  { name: 'Nausea & Vomiting',     letter: 'N', desc: 'Nausea is an uneasiness of the stomach often preceding vomiting. It can result from motion sickness, pregnancy, infections, or certain medications.', search: 'ondansetron' },
  { name: 'Nerve Pain',            letter: 'N', desc: 'Neuropathic pain is caused by damage or disease affecting the somatosensory nervous system. It often feels like a shooting, burning, or stabbing sensation.', search: 'pregabalin' },
  // O
  { name: 'Obesity',               letter: 'O', desc: 'Obesity is a complex medical condition involving excess body fat. It increases the risk of other diseases including type 2 diabetes, high blood pressure, and heart disease.', search: 'orlistat' },
  { name: 'Osteoporosis',          letter: 'O', desc: 'Osteoporosis is a bone disease that develops when bone mineral density decreases. It makes bones weak and fragile, increasing the risk of fractures.', search: 'calcium' },
  // P
  { name: 'Pain & Inflammation',   letter: 'P', desc: 'Pain and inflammation can affect muscles, joints, and tissues. NSAIDs and analgesics like ibuprofen and diclofenac are commonly used treatments.', search: 'ibuprofen' },
  { name: 'Pneumonia',             letter: 'P', desc: 'Pneumonia is an infection that inflames air sacs in one or both lungs. The air sacs may fill with fluid, causing cough with phlegm, fever, and difficulty breathing.', search: 'azithromycin' },
  { name: 'Psoriasis',             letter: 'P', desc: 'Psoriasis is a skin disease causing red, itchy scaly patches most commonly on the knees, elbows, trunk, and scalp. It is a chronic disease with no cure.', search: 'calcipotriol' },
  // R
  { name: 'Rashes & Skin Allergy', letter: 'R', desc: 'Skin rashes are areas of irritated or swollen skin that appear differently depending on the cause. Many have similar symptoms such as redness, itching, and pain.', search: 'hydrocortisone' },
  { name: 'Respiratory Infection', letter: 'R', desc: 'Respiratory infections affect the airways and lungs. They can be caused by viruses or bacteria and range from mild colds to serious pneumonia.', search: 'amoxicillin' },
  // S
  { name: 'Skin Infection',        letter: 'S', desc: 'Skin infections are caused by bacteria, viruses, fungi, or parasites. Symptoms range from mild irritation and redness to severe pain and swelling.', search: 'clotrimazole' },
  { name: 'Stomach Pain',          letter: 'S', desc: 'Stomach pain (abdominal pain) is a common complaint that can range from mild discomfort to severe, acute pain. Causes include gas, indigestion, and infections.', search: 'mebeverine' },
  { name: 'Stress',                letter: 'S', desc: 'Stress is a normal physiological reaction to events that feel threatening or overwhelming. Chronic stress can harm physical health and mental wellbeing.', search: 'ashwagandha' },
  // T
  { name: 'Thyroid Disorders',     letter: 'T', desc: 'Thyroid disorders are conditions that affect thyroid gland function. They include hypothyroidism, hyperthyroidism, and thyroid nodules.', search: 'levothyroxine' },
  { name: 'Toothache',             letter: 'T', desc: 'Toothache is pain in or around a tooth. It can be sharp and stabbing or a dull constant ache caused by cavities, gum disease, or a cracked tooth.', search: 'ibuprofen' },
  { name: 'Tuberculosis',          letter: 'T', desc: 'Tuberculosis (TB) is a potentially serious infectious disease mainly affecting the lungs, caused by mycobacteria and spread through air droplets.', search: 'rifampicin' },
  // U
  { name: 'Ulcers',                letter: 'U', desc: 'Peptic ulcers are open sores developing on the inside lining of the stomach or upper small intestine. They cause a burning stomach pain.', search: 'pantoprazole' },
  { name: 'Urinary Tract Infection',letter: 'U', desc: 'A urinary tract infection (UTI) is an infection in any part of the urinary system — kidneys, ureters, bladder, and urethra. It causes burning urination.', search: 'nitrofurantoin' },
  // V
  { name: 'Viral Fever',           letter: 'V', desc: 'Viral fever is an umbrella term for various viral infections causing fever, body aches, and headache. It is common during seasonal changes.', search: 'paracetamol' },
  { name: 'Vitamin Deficiency',    letter: 'V', desc: 'Vitamin deficiencies occur when the body does not get enough of certain vitamins, leading to problems like weak bones, fatigue, and poor immunity.', search: 'vitamin' },
  // W
  { name: 'Weakness & Fatigue',    letter: 'W', desc: 'Weakness and fatigue describe a state of low energy. They can be caused by anaemia, thyroid issues, vitamin deficiency, diabetes, or heart conditions.', search: 'multivitamin' },
  { name: 'Worm Infestation',      letter: 'W', desc: 'Intestinal worms are parasites that infest the gut. Symptoms include abdominal pain, diarrhoea, and weight loss. They are common in children.', search: 'albendazole' },
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function Diseases() {
  const [activeLetter, setActiveLetter] = useState('A');

  const filtered = useMemo(
    () => DISEASES.filter(d => d.letter === activeLetter),
    [activeLetter]
  );

  const hasData = useMemo(() => new Set(DISEASES.map(d => d.letter)), []);

  return (
    <div className="diseases-page">
      <SEO
        title="Health Resource Center – Diseases, Symptoms & Medicines"
        description="Browse common diseases and health conditions from A to Z. Find symptoms, causes, and related medicines available at Batla Medicos. Expert health information for informed decisions."
        path="/diseases"
      />
      <div className="diseases-header">
        <h1 className="diseases-title">
          Disease Index starting with &mdash; <span className="diseases-title__letter">{activeLetter}</span>
        </h1>
      </div>

      {/* A–Z alphabet bar */}
      <div className="diseases-az">
        {ALPHABET.map(letter => (
          <button
            key={letter}
            className={`diseases-az__btn${
              activeLetter === letter ? ' diseases-az__btn--active' : ''
            }${!hasData.has(letter) ? ' diseases-az__btn--empty' : ''}`}
            onClick={() => hasData.has(letter) && setActiveLetter(letter)}
            disabled={!hasData.has(letter)}
          >
            {letter}
          </button>
        ))}
      </div>

      <p className="diseases-count">
        Showing 1&ndash;{filtered.length} of {filtered.length} results
      </p>

      <div className="diseases-grid">
        {filtered.map(d => (
          <Link
            key={d.name}
            className="disease-card"
            to={`/products?search=${encodeURIComponent(d.search)}`}
          >
            <div className="disease-card__img">
              <span className="disease-card__initial">{d.name[0]}</span>
            </div>
            <div className="disease-card__body">
              <h3 className="disease-card__name">{d.name}</h3>
              <p className="disease-card__desc">{d.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
