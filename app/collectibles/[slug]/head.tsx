export default function Head({ params }: { params: { slug: string } }) {
  const slug = encodeURIComponent(params.slug || '');
  const base = process.env.NEXT_PUBLIC_APP_URL || '';
  const pageUrl = `${base}/collectibles/${slug}`;
  const imageUrl = `${base}/api/collectibles/og/${slug}`;
  const title = 'Your Collectible';
  const description = 'Unlock, read the lore, and share your achievement.';

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={pageUrl} />

      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </>
  );
}
