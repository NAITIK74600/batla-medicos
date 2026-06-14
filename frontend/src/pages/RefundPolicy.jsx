import { Link } from 'react-router-dom';
import { RefreshCw, Mail, MapPin, Phone, CheckCircle, XCircle, Clock } from 'lucide-react';
import SEO from '../components/SEO';

export default function RefundPolicy() {
  return (
    <main className="policy-page container">
      <SEO title="Cancellation & Refund Policy" description="Batla Medicos cancellation and refund policy. Learn about return eligibility, refund timelines, and how to request a refund for medicines and healthcare products." path="/refund-policy" />
      <div className="policy-hero">
        <div className="policy-hero__icon"><RefreshCw size={32} /></div>
        <div>
          <h1>Cancellation &amp; Refund Policy</h1>
          <p>Last updated: March 20, 2026</p>
        </div>
      </div>

      <div className="policy-body">

        <section>
          <h2>1. Overview</h2>
          <p>
            At <strong>Batla Medicos Chemist &amp; Cosmetics</strong>, we want you to have complete confidence when
            ordering from us. This policy outlines the conditions under which you can cancel an order and receive
            a refund.
          </p>
        </section>

        <section>
          <h2>2. Cancellation — Medicine Orders</h2>

          <div className="policy-card policy-card--green">
            <CheckCircle size={18} />
            <div>
              <strong>Before Dispatch — FREE cancellation</strong>
              <p>You may cancel any order at no charge before it has been dispatched from our store. Contact us immediately via WhatsApp (<a href="https://wa.me/919990165925">+91 99901 65925</a>) or phone.</p>
            </div>
          </div>

          <div className="policy-card policy-card--red" style={{ marginTop: 12 }}>
            <XCircle size={18} />
            <div>
              <strong>After Dispatch — Not cancellable</strong>
              <p>Once the order has been dispatched, it cannot be cancelled online. Please refuse the delivery and it will be returned to us. A refund will be initiated after we receive the products back in sealed condition.</p>
            </div>
          </div>
        </section>

        <section>
          <h2>3. Returns — When Are Returns Accepted?</h2>
          <p>We accept returns only in the following circumstances:</p>
          <ul>
            <li>You received a <strong>wrong product</strong> (different medicine / different strength).</li>
            <li>The product was <strong>damaged or tampered</strong> during delivery.</li>
            <li>The product's <strong>expiry date has already passed</strong> at the time of delivery.</li>
            <li>You received an <strong>incomplete order</strong> (missing items).</li>
          </ul>

          <h3>Returns NOT accepted:</h3>
          <ul>
            <li>Medicines that have been <strong>opened</strong> or the seal is broken (except when the product itself is defective).</li>
            <li>Products that require <strong>cold storage</strong> (refrigerated medicines, vaccines) once delivered — we cannot guarantee the cold chain has been maintained after delivery.</li>
            <li>Returns requested more than <strong>48 hours</strong> after delivery.</li>
            <li>Returns for products purchased under a <strong>prescription</strong> (for regulatory reasons), unless the product was wrong, damaged, or expired.</li>
          </ul>
        </section>

        <section>
          <h2>4. Lab Test Bookings — Cancellation &amp; Refund</h2>
          <div className="policy-timeline">
            <div className="policy-timeline__item">
              <div className="policy-timeline__dot policy-timeline__dot--green" />
              <div>
                <strong>More than 24 hours before scheduled slot</strong>
                <p>Full refund. Cancellation can be done online or by contacting us.</p>
              </div>
            </div>
            <div className="policy-timeline__item">
              <div className="policy-timeline__dot policy-timeline__dot--yellow" />
              <div>
                <strong>Less than 24 hours before scheduled slot</strong>
                <p>50% refund. The slot fee is partially charged to cover the phlebotomist's visit costs.</p>
              </div>
            </div>
            <div className="policy-timeline__item">
              <div className="policy-timeline__dot policy-timeline__dot--red" />
              <div>
                <strong>After sample collection</strong>
                <p>No refund. Once the sample has been collected, lab processing begins immediately.</p>
              </div>
            </div>
            <div className="policy-timeline__item">
              <div className="policy-timeline__dot policy-timeline__dot--green" />
              <div>
                <strong>Lab unable to collect / process sample</strong>
                <p>Full refund if we are unable to collect your sample due to a fault on our end, or if the lab fails to process the test.</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2>5. Refund Process</h2>
          <div className="policy-steps">
            <div className="policy-step">
              <div className="policy-step__num">1</div>
              <div>
                <strong>Raise a request</strong>
                <p>WhatsApp or call us at <a href="tel:+919990165925">+91 99901 65925</a> or email <a href="mailto:ordersupport@batlamedicos.shop">ordersupport@batlamedicos.shop</a> with your Order ID and reason.</p>
              </div>
            </div>
            <div className="policy-step">
              <div className="policy-step__num">2</div>
              <div>
                <strong>Verification (1–2 business days)</strong>
                <p>Our team verifies the issue. We may ask for a photograph of the delivered product.</p>
              </div>
            </div>
            <div className="policy-step">
              <div className="policy-step__num">3</div>
              <div>
                <strong>Refund initiated</strong>
                <p>Once approved, the refund is processed within <strong>5–7 business days</strong> to your original payment method.</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2>6. Refund Methods</h2>
          <ul>
            <li><strong>Online payments (Razorpay):</strong> Refunded to the original UPI / card / net-banking account. Banks typically credit within 5–7 business days.</li>
            <li><strong>Cash on Delivery (COD):</strong> Refunded via <strong>bank transfer (NEFT/IMPS)</strong> to a bank account provided by you. Processing time: 5–7 business days after account details are received.</li>
          </ul>
        </section>

        <section>
          <h2>7. Non-Refundable Situations</h2>
          <ul>
            <li>Delivery charges are non-refundable unless the entire order was wrong or damaged.</li>
            <li>Discount coupons and promotional credits used in an order are non-refundable under any circumstances.</li>
            <li>Refund requests raised after 48 hours of delivery will not be accepted.</li>
          </ul>
        </section>

        <section>
          <h2>8. Cancellation by Batla Medicos</h2>
          <p>
            We may cancel your order if:
          </p>
          <ul>
            <li>The product is out of stock after order confirmation.</li>
            <li>A prescription cannot be verified or is found invalid.</li>
            <li>Your delivery address is outside our serviceable area.</li>
            <li>There is a pricing error on our Platform.</li>
          </ul>
          <p>In all such cases, a <strong>full refund</strong> will be issued within 5–7 business days.</p>
        </section>

        <section>
          <h2>9. Contact for Refund Queries</h2>
          <ul className="policy-contact-list">
            <li><Clock size={15} /> Response time: within 24 hours on business days</li>
            <li><MapPin size={15} /> F 41/2, Nafees Road, Batla House, Jamia Nagar, New Delhi – 110025</li>
            <li><Phone size={15} /> <a href="tel:+919990165925">+91 99901 65925</a></li>
            <li><Mail size={15} /> <a href="mailto:ordersupport@batlamedicos.shop">ordersupport@batlamedicos.shop</a></li>
          </ul>
        </section>

      </div>

      <div className="policy-footer-links">
        <Link to="/privacy-policy">Privacy Policy</Link>
        <span>·</span>
        <Link to="/terms">Terms &amp; Conditions</Link>
        <span>·</span>
        <Link to="/">Home</Link>
      </div>
    </main>
  );
}
