import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Tag, ChevronLeft, ChevronRight, Zap, Truck } from 'lucide-react';
import { trackOfferClick } from '../api/offers';

function Countdown({ endDate }) {
  const [left, setLeft] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = new Date(endDate) - Date.now();
      if (diff <= 0) { setLeft(''); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLeft(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [endDate]);
  if (!left) return null;
  return <span className="offer-banner-card__countdown">⏱ {left}</span>;
}

export default function OfferBanner({ offers }) {
  const [idx, setIdx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [dir, setDir] = useState('next');
  const timerRef = useRef(null);

  const go = (newIdx, direction = 'next') => {
    if (animating) return;
    setDir(direction);
    setAnimating(true);
    setTimeout(() => {
      setIdx(newIdx);
      setAnimating(false);
    }, 400);
  };

  const next = () => go((idx + 1) % offers.length, 'next');
  const prev = () => go((idx - 1 + offers.length) % offers.length, 'prev');

  useEffect(() => {
    if (offers.length < 2) return;
    timerRef.current = setInterval(next, 5000);
    return () => clearInterval(timerRef.current);
  }, [idx, offers.length]);

  if (!offers.length) return null;

  const offer = offers[idx];

  return (
    <section className="offer-banner-section">
      {/* Floating particles */}
      <div className="offer-banner-particles">
        {[...Array(12)].map((_, i) => (
          <span key={i} className={`particle particle--${i % 4}`} style={{ '--i': i }} />
        ))}
      </div>

      {/* Scrolling ticker tape */}
      <div className="offer-ticker">
        <div className="offer-ticker__track">
          {[...offers, ...offers, ...offers].map((o, i) => (
            <span key={i} className="offer-ticker__item">
              <Zap size={12} /> {o.title} &nbsp;&bull;&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* Main 3D card */}
      <div className="offer-banner-stage">
        <button className="offer-banner-nav offer-banner-nav--prev" onClick={prev} aria-label="Previous offer">
          <ChevronLeft size={22} />
        </button>

        <div className={`offer-banner-card ${animating ? `offer-banner-card--exit-${dir}` : 'offer-banner-card--enter'}`}>
          <div className="offer-banner-card__inner">
            {/* Glowing bg blob */}
            <div className="offer-banner-card__glow" />

            {/* Discount badge */}
            {offer.discountText && (
              <div className="offer-banner-card__discount" style={{ background: offer.badgeColor || '#C0392B' }}>
                {offer.discountText}
              </div>
            )}

            {/* Badge */}
            <div className="offer-banner-card__badge">
              <Tag size={13} /> SPECIAL OFFER
            </div>

            {/* Image */}
            <div className="offer-banner-card__img-wrap">
              <img src={offer.imageUrl} alt={offer.title} className="offer-banner-card__img" />
              <div className="offer-banner-card__img-shine" />
            </div>

            {/* Text */}
            <div className="offer-banner-card__text">
              <h3 className="offer-banner-card__title">{offer.title}</h3>
              {offer.description && <p className="offer-banner-card__desc">{offer.description}</p>}

              <div className="offer-banner-card__tags">
                {offer.freeDelivery && (
                  <span className="offer-banner-card__free-delivery">
                    <Truck size={13} /> Free Delivery{offer.freeDeliveryMin > 0 ? ` above ₹${offer.freeDeliveryMin}` : ''}
                  </span>
                )}
                <Countdown endDate={offer.endDate} />
              </div>

              <Link
                to={(!offer.link || offer.link === '/') ? '/products' : offer.link}
                className="offer-banner-card__cta"
                onClick={e => {
                  e.stopPropagation();
                  trackOfferClick(offer._id).catch(() => {});
                }}
              >
                Shop Now →
              </Link>
            </div>
          </div>
        </div>

        <button className="offer-banner-nav offer-banner-nav--next" onClick={next} aria-label="Next offer">
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Dots */}
      {offers.length > 1 && (
        <div className="offer-banner-dots">
          {offers.map((_, i) => (
            <button
              key={i}
              className={`offer-banner-dot ${i === idx ? 'active' : ''}`}
              onClick={() => go(i, i > idx ? 'next' : 'prev')}
              aria-label={`Go to offer ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
