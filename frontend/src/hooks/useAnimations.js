import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Intersection Observer hook for scroll-triggered animations.
 * Returns a ref to attach to the element and a boolean `inView`.
 */
export function useInView(options = {}) {
  const { threshold = 0.15, rootMargin = '0px', once = true } = options;
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        if (once) obs.disconnect();
      } else if (!once) {
        setInView(false);
      }
    }, { threshold, rootMargin });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, inView];
}

/**
 * Creates a ripple effect at click position inside an element.
 */
export function useRipple() {
  const handleRipple = useCallback((e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }, []);

  return handleRipple;
}

/**
 * Staggered children animation — adds delay to each child.
 */
export function getStaggerDelay(index, base = 0.08) {
  return `${index * base}s`;
}

/**
 * 3D tilt effect — tilts an element toward the mouse cursor.
 * Attach the returned ref to the element. Resets on mouse-leave.
 * @param {number} maxTilt — degrees of max tilt (default 12)
 * @param {number} perspective — px perspective (default 800)
 * @param {number} scale — hover scale (default 1.02)
 */
export function useTilt3D({ maxTilt = 12, perspective = 800, scale = 1.02 } = {}) {
  const ref = useRef(null);
  const rafId = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMove = (e) => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const rotateY = (x - 0.5) * maxTilt * 2;
        const rotateX = (0.5 - y) * maxTilt * 2;
        el.style.transform = `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale},${scale},${scale})`;
      });
    };

    const handleLeave = () => {
      cancelAnimationFrame(rafId.current);
      el.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)`;
    };

    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      cancelAnimationFrame(rafId.current);
      el.removeEventListener('mousemove', handleMove);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, [maxTilt, perspective, scale]);

  return ref;
}

/**
 * Mouse-tracking parallax for hero section.
 * Moves child layers at different speeds based on data-depth attribute.
 */
export function useParallaxMouse() {
  const ref = useRef(null);
  const rafId = useRef(0);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const handleMove = (e) => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / rect.width - 0.5;
        const cy = (e.clientY - rect.top) / rect.height - 0.5;
        const layers = container.querySelectorAll('[data-depth]');
        layers.forEach((layer) => {
          const depth = parseFloat(layer.dataset.depth) || 1;
          const moveX = cx * depth * 40;
          const moveY = cy * depth * 40;
          layer.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;
        });
      });
    };

    const handleLeave = () => {
      cancelAnimationFrame(rafId.current);
      const layers = container.querySelectorAll('[data-depth]');
      layers.forEach((layer) => {
        layer.style.transform = 'translate3d(0, 0, 0)';
      });
    };

    container.addEventListener('mousemove', handleMove);
    container.addEventListener('mouseleave', handleLeave);
    return () => {
      cancelAnimationFrame(rafId.current);
      container.removeEventListener('mousemove', handleMove);
      container.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  return ref;
}
