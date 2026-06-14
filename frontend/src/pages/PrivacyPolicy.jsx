import { Link } from 'react-router-dom';
import { Shield, Lock, Eye, Mail, MapPin, Phone } from 'lucide-react';
import SEO from '../components/SEO';

export default function PrivacyPolicy() {
  return (
    <main className="policy-page container">
      <SEO title="Privacy Policy" description="Privacy policy of Batla Medicos. Learn how we collect, use, and protect your personal data when you shop medicines online." path="/privacy-policy" />
      <div className="policy-hero">
        <div className="policy-hero__icon"><Shield size={32} /></div>
        <div>
          <h1>Privacy Policy</h1>
          <p>Last updated: March 20, 2026</p>
        </div>
      </div>

      <div className="policy-body">

        <section>
          <h2>1. About Us</h2>
          <p>
            Batla Medicos Chemist &amp; Cosmetics ("<strong>we</strong>", "<strong>us</strong>", "<strong>our</strong>") is a licensed retail pharmacy
            operating at F 41/2, Nafees Road, Batla House, Jamia Nagar, New Delhi – 110025.
            We operate the website <a href="https://batlamedicos.shop">batlamedicos.shop</a> ("<strong>Platform</strong>").
          </p>
          <p>
            This Privacy Policy explains how we collect, use, store, and protect your personal information when you
            use our Platform to purchase medicines, book lab tests, or upload prescriptions.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          <h3>2.1 Information You Provide</h3>
          <ul>
            <li><strong>Account details:</strong> Name, email address, mobile number, and password when you register.</li>
            <li><strong>Delivery address:</strong> House number, street, city, pincode for order fulfillment.</li>
            <li><strong>Health information:</strong> Prescription images, doctor/patient names, and notes that you voluntarily upload for medicine ordering purposes.</li>
            <li><strong>Payment information:</strong> We do <em>not</em> store card or bank account details. Payments are processed by Razorpay, a PCI-DSS compliant payment gateway.</li>
            <li><strong>Lab booking details:</strong> Patient name, age, gender, phone, and preferred collection type/slot.</li>
            <li><strong>Communications:</strong> Messages you send to us via WhatsApp, email, or our on-site chat.</li>
          </ul>

          <h3>2.2 Information We Collect Automatically</h3>
          <ul>
            <li>Device type, browser type, and operating system.</li>
            <li>IP address and approximate location (city/region level).</li>
            <li>Pages visited and time spent on the Platform.</li>
            <li>GPS co-ordinates — <em>only</em> when you tap "Auto-fill Address" or "Share Live Location", and only with your explicit browser permission.</li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <ul>
            <li>Processing medicine orders and lab test bookings.</li>
            <li>Verifying prescriptions with our licensed pharmacist before dispensing Schedule H /Schedule H1 medicines.</li>
            <li>Communicating order status, delivery updates, and OTP via SMS, email, and WhatsApp.</li>
            <li>Processing refunds, returns, and customer support queries.</li>
            <li>Sending promotional offers and health tips — you may opt out at any time by emailing us.</li>
            <li>Complying with applicable laws including the Drugs and Cosmetics Act, 1940, and the Information Technology Act, 2000.</li>
          </ul>
        </section>

        <section>
          <h2>4. Sharing Your Information</h2>
          <p>We do <strong>not</strong> sell your personal data. We share information only with:</p>
          <ul>
            <li><strong>Razorpay Financial Solutions Pvt. Ltd.</strong> — for secure payment processing.</li>
            <li><strong>Delivery partners</strong> — name, phone, and delivery address to fulfil your order.</li>
            <li><strong>Diagnostic labs</strong> — patient details necessary for processing your lab test.</li>
            <li><strong>Government / regulatory authorities</strong> — if required by law (e.g., narcotic drug registers, GST filings).</li>
          </ul>
        </section>

        <section>
          <h2>5. Prescription Data</h2>
          <p>
            Uploaded prescription images are stored securely and accessed only by our licensed pharmacists to verify
            the prescription. We retain prescription images for a minimum of <strong>2 years</strong> in compliance
            with the Drugs and Cosmetics Act. Prescriptions are <strong>never</strong> shared with third parties for
            marketing purposes.
          </p>
        </section>

        <section>
          <h2>6. Data Security</h2>
          <ul>
            <li>All data transmitted between your browser and our servers is encrypted via <strong>HTTPS / TLS</strong>.</li>
            <li>Passwords are hashed using bcrypt and are never stored in plain text.</li>
            <li>Authentication tokens are short-lived and rotated regularly.</li>
            <li>Access to prescription data and health records is restricted to pharmacist staff only.</li>
          </ul>
        </section>

        <section>
          <h2>7. Cookies</h2>
          <p>
            We use session cookies to keep you logged in and preference cookies to remember your cart.
            We do not use third-party advertising cookies. You can disable cookies in your browser settings,
            though some features (such as checkout) may not work without them.
          </p>
        </section>

        <section>
          <h2>8. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you.</li>
            <li>Correct inaccurate personal data.</li>
            <li>Request deletion of your account and associated data (subject to legal retention requirements).</li>
            <li>Withdraw consent for promotional communications at any time.</li>
          </ul>
          <p>To exercise any of these rights, email us at <a href="mailto:ordersupport@batlamedicos.shop">ordersupport@batlamedicos.shop</a>.</p>
        </section>

        <section>
          <h2>9. Children's Privacy</h2>
          <p>
            Our Platform is not directed at children under the age of 18. We do not knowingly collect personal
            information from minors. If you believe a minor has provided us with personal data, please contact us
            and we will delete it promptly.
          </p>
        </section>

        <section>
          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be posted on this page with an
            updated "Last updated" date. Continued use of the Platform after changes constitutes acceptance of the
            revised policy.
          </p>
        </section>

        <section>
          <h2>11. Contact Us</h2>
          <p>For any privacy-related questions or complaints:</p>
          <ul className="policy-contact-list">
            <li><MapPin size={15} /> F 41/2, Nafees Road, Batla House, Jamia Nagar, New Delhi – 110025</li>
            <li><Phone size={15} /> +91 99901 65925</li>
            <li><Mail size={15} /> <a href="mailto:ordersupport@batlamedicos.shop">ordersupport@batlamedicos.shop</a></li>
          </ul>
        </section>

      </div>

      <div className="policy-footer-links">
        <Link to="/terms">Terms &amp; Conditions</Link>
        <span>·</span>
        <Link to="/refund-policy">Refund Policy</Link>
        <span>·</span>
        <Link to="/">Home</Link>
      </div>
    </main>
  );
}
