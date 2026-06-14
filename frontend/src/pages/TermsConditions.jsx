import { Link } from 'react-router-dom';
import { FileText, Mail, MapPin, Phone } from 'lucide-react';
import SEO from '../components/SEO';

export default function TermsConditions() {
  return (
    <main className="policy-page container">
      <SEO title="Terms & Conditions" description="Terms and conditions for using Batla Medicos online pharmacy. Read our usage policies, ordering terms, and delivery guidelines." path="/terms" />
      <div className="policy-hero">
        <div className="policy-hero__icon"><FileText size={32} /></div>
        <div>
          <h1>Terms &amp; Conditions</h1>
          <p>Last updated: March 20, 2026</p>
        </div>
      </div>

      <div className="policy-body">

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using <a href="https://batlamedicos.shop">batlamedicos.shop</a> ("Platform") operated by
            <strong> Batla Medicos Chemist &amp; Cosmetics</strong> ("<strong>we</strong>", "<strong>us</strong>"),
            you agree to be bound by these Terms &amp; Conditions and our <Link to="/privacy-policy">Privacy Policy</Link>.
            If you do not agree, please do not use the Platform.
          </p>
        </section>

        <section>
          <h2>2. Eligibility</h2>
          <ul>
            <li>You must be at least <strong>18 years of age</strong> to place orders on this Platform.</li>
            <li>You must be located in <strong>India</strong> at the time of placing an order.</li>
            <li>Orders for Schedule H, H1, and X drugs require a valid prescription from a registered medical practitioner. Placing an order for these medicines without a valid prescription is prohibited.</li>
          </ul>
        </section>

        <section>
          <h2>3. Products and Availability</h2>
          <ul>
            <li>All medicines listed are subject to availability. We reserve the right to cancel an order if a product is found to be out of stock after placement.</li>
            <li>Product images are for illustration purposes only. Actual packaging, batch, and expiry may vary.</li>
            <li>Prices are inclusive of applicable taxes and are subject to change without notice. The price charged will be the price shown at the time you place your order.</li>
          </ul>
        </section>

        <section>
          <h2>4. Prescription Medicines</h2>
          <ul>
            <li>Prescription medicines are dispensed <strong>only</strong> after verification of a valid prescription by our licensed pharmacist.</li>
            <li>You agree to upload a genuine and current prescription. Uploading a forged, invalid, or expired prescription is illegal and will result in immediate order cancellation and may be reported to the relevant authorities.</li>
            <li>We reserve the right to contact your prescribing doctor for verification if required.</li>
          </ul>
        </section>

        <section>
          <h2>5. Orders and Payment</h2>
          <ul>
            <li>An order is confirmed only after you receive an order confirmation from us. Listing of a product does not constitute an offer to sell.</li>
            <li>We accept Cash on Delivery (COD) and online payments via <strong>Razorpay</strong> (UPI, debit/credit cards, net banking).</li>
            <li>For COD orders, payment must be made in exact change at the time of delivery. Our delivery partners do not carry change.</li>
            <li>In the event of a failed payment, the order will be cancelled. Please retry or contact us.</li>
          </ul>
        </section>

        <section>
          <h2>6. Delivery</h2>
          <ul>
            <li>We deliver within <strong>Jamia Nagar, Batla House, Okhla, and surrounding areas of New Delhi</strong>. Delivery to other areas may be arranged based on availability — please call/WhatsApp us to confirm.</li>
            <li>Delivery charges are ₹29 per order. Orders above ₹499 qualify for free delivery.</li>
            <li>Estimated delivery time is same-day or next-day. Actual delivery times may vary due to traffic, weather, or stock availability.</li>
            <li>You must provide a valid delivery address and mobile number. We are not responsible for non-delivery due to incorrect address information.</li>
            <li>Delivery will be confirmed via a 4-digit OTP shared with your registered mobile number.</li>
          </ul>
        </section>

        <section>
          <h2>7. Lab Tests</h2>
          <ul>
            <li>Lab test bookings are subject to availability of the diagnostic lab partner's slots in your area.</li>
            <li>Home sample collection is available within the delivery area.</li>
            <li>Test reports are delivered digitally within the stated turnaround time. Delays due to the diagnostic lab are beyond our control.</li>
            <li>Lab test bookings are non-transferable.</li>
          </ul>
        </section>

        <section>
          <h2>8. Cancellation by Customer</h2>
          <ul>
            <li>You may cancel an order before it is dispatched by contacting us via WhatsApp or phone.</li>
            <li>Once dispatched, orders cannot be cancelled. Please refer to our <Link to="/refund-policy">Refund Policy</Link>.</li>
            <li>Lab test bookings may be cancelled up to <strong>24 hours</strong> before the scheduled collection time for a full refund.</li>
          </ul>
        </section>

        <section>
          <h2>9. Cancellation by Us</h2>
          <p>We reserve the right to cancel any order if:</p>
          <ul>
            <li>The product is out of stock or discontinued.</li>
            <li>A prescription is found to be invalid, forged, or expired.</li>
            <li>The delivery address is outside our serviceable area.</li>
            <li>There is a pricing error due to a technical issue.</li>
            <li>Payment is declined or not received.</li>
          </ul>
          <p>In such cases, a full refund will be initiated within 5–7 business days.</p>
        </section>

        <section>
          <h2>10. Intellectual Property</h2>
          <p>
            All content on this Platform — including text, images, logos, and software — is the property of Batla
            Medicos or its licencors and is protected by applicable intellectual property laws. You may not
            reproduce, distribute, or create derivative works without our written consent.
          </p>
        </section>

        <section>
          <h2>11. Limitation of Liability</h2>
          <ul>
            <li>We are a licensed retail pharmacy and are not a substitute for professional medical advice. Always consult a qualified doctor before taking any medicine.</li>
            <li>We shall not be liable for any indirect, incidental, or consequential losses arising from your use of the Platform or medicines purchased.</li>
            <li>Our total liability for any claim shall not exceed the value of the order in question.</li>
          </ul>
        </section>

        <section>
          <h2>12. Governing Law</h2>
          <p>
            These Terms are governed by the laws of <strong>India</strong>. Any disputes shall be subject to the exclusive
            jurisdiction of the courts of <strong>New Delhi</strong>.
          </p>
        </section>

        <section>
          <h2>13. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. Changes will be effective when posted.
            Continued use of the Platform constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2>14. Contact Us</h2>
          <ul className="policy-contact-list">
            <li><MapPin size={15} /> F 41/2, Nafees Road, Batla House, Jamia Nagar, New Delhi – 110025</li>
            <li><Phone size={15} /> +91 99901 65925</li>
            <li><Mail size={15} /> <a href="mailto:ordersupport@batlamedicos.shop">ordersupport@batlamedicos.shop</a></li>
          </ul>
        </section>

      </div>

      <div className="policy-footer-links">
        <Link to="/privacy-policy">Privacy Policy</Link>
        <span>·</span>
        <Link to="/refund-policy">Refund Policy</Link>
        <span>·</span>
        <Link to="/">Home</Link>
      </div>
    </main>
  );
}
