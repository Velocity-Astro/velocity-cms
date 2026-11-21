import { Link } from 'react-aria-components';
import {
  siteWindowAddressClass,
  siteWindowBarClass,
  siteWindowClass,
  siteWindowDotClass,
  siteWindowDotsClass,
  siteWindowFootClass,
  siteWindowFrameClass,
  siteWindowLinkClass,
  siteWindowMetaClass,
  siteWindowSpacerClass,
  siteWindowViewClass,
} from './SiteWindow.variants.js';

export interface SiteWindowProps {
  /** The site's address, shown where a browser shows it: "lakeshore.example". */
  readonly address: string;
  /** The page to show, as visitors see it: a path on the site, such as "/". */
  readonly src: string;
  /** What the page is, for screen readers: "The home page of Lakeshore Realty". */
  readonly title: string;
  /** What pressing the card does, at its foot: "Edit the home page". */
  readonly label: string;
  /** A few words at the foot before it: when the page was last published, and by whom. */
  readonly meta?: string;
  /** Where pressing the card leads. */
  readonly href?: string;
  /** What pressing the card does, when it leads nowhere by itself. */
  readonly onPress?: () => void;
}

/** A page of the site in a small browser window, as visitors see it now. The whole card is one link. */
export function SiteWindow({ address, src, title, label, meta, href, onPress }: SiteWindowProps) {
  return (
    <div className={siteWindowClass}>
      <div aria-hidden className={siteWindowBarClass}>
        <span className={siteWindowDotsClass}>
          <span className={siteWindowDotClass} />
          <span className={siteWindowDotClass} />
          <span className={siteWindowDotClass} />
        </span>
        <span className={siteWindowAddressClass}>{address}</span>
        <span className={siteWindowSpacerClass} />
      </div>
      <div className={siteWindowViewClass}>
        <iframe src={src} title={title} loading="lazy" tabIndex={-1} aria-hidden className={siteWindowFrameClass} />
      </div>
      <div className={siteWindowFootClass}>
        {meta !== undefined && <span className={siteWindowMetaClass}>{meta}</span>}
        <Link className={siteWindowLinkClass} {...(href !== undefined && { href })} {...(onPress !== undefined && { onPress })}>
          {label}
        </Link>
      </div>
    </div>
  );
}
