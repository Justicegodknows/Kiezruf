import { PHOTOS, type PhotoKey } from '@kiezruf/shared';
import Image from 'next/image';

/** Location photo from Wikimedia Commons with the credit its licence asks for. */
export function Photo({
  photo,
  alt,
  label,
  credit,
  className,
  sizes,
  eager,
}: {
  photo: PhotoKey;
  alt: string;
  /** Short overlay tag, e.g. "Location view". */
  label?: string;
  /** Localised "Photo" word for the credit line; omit to leave the credit to a credits page. */
  credit?: string;
  className?: string;
  sizes: string;
  /** Above the fold: load eagerly with high priority (it is the page's largest image). */
  eager?: boolean;
}) {
  const c = PHOTOS[photo];
  return (
    <figure className={className ? `photo ${className}` : 'photo'}>
      <div className="photo__frame">
        <Image
          src={`/photos/${photo}.jpg`}
          alt={alt}
          fill
          sizes={sizes}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          className="photo__img"
        />
        {label && <span className="photo__label">{label}</span>}
      </div>
      {credit && (
        <figcaption className="photo__credit">
          {credit}: {c.author},{' '}
          <a href={c.licenseUrl} rel="license noopener" target="_blank">
            {c.license}
          </a>
          ,{' '}
          <a href={c.source} rel="noopener" target="_blank">
            Wikimedia Commons
          </a>
        </figcaption>
      )}
    </figure>
  );
}
