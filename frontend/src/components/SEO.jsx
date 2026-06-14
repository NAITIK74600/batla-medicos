import { Helmet } from 'react-helmet-async';

const SITE = 'Batla Medicos';
const DOMAIN = 'https://www.batlamedicos.shop';
const DEFAULT_IMG = `${DOMAIN}/og-image.jpg`;

/**
 * Reusable SEO component — sets title, meta description, OG tags, canonical, and optional JSON-LD schema.
 *
 * @param {string}  title       Page title (appended with " | Batla Medicos")
 * @param {string}  description Meta description (max ~155 chars recommended)
 * @param {string}  [path]      URL path e.g. "/products" — used for canonical
 * @param {string}  [image]     OG image URL (defaults to site OG image)
 * @param {string}  [type]      OG type (default "website")
 * @param {object}  [schema]    JSON-LD schema object to inject
 * @param {string}  [noIndex]   Set to true to add noindex
 */
export default function SEO({ title, description, path = '', image, type = 'website', schema, noIndex }) {
  const fullTitle = title ? `${title} | ${SITE}` : `${SITE} – Chemist & Cosmetics | Online Pharmacy New Delhi`;
  const url = `${DOMAIN}${path}`;
  const img = image || DEFAULT_IMG;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={img} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={img} />

      {/* JSON-LD Schema */}
      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      )}
    </Helmet>
  );
}
