import { logoAccentClass, logoBodyVariants, logoVariants, type LogoVariants } from './Logo.variants.js';

export interface LogoProps extends LogoVariants {
  /** What the mark stands for, such as "Velocity", for screen readers. */
  readonly label: string;
}

/** The Velocity mark. */
export function Logo({ label, size, tone }: LogoProps) {
  return (
    <svg role="img" aria-label={label} viewBox="0 0 90 101" className={logoVariants({ size })}>
      <path
        className={logoAccentClass}
        d="M35.1288 23.8398L45.1667 49.4151L56.2482 23.8398H87.1082C86.5647 23.3764 85.9776 22.9637 85.3616 22.5944L48.6165 0.704798C46.377 -0.0699896 43.4273 -0.439281 41.2675 0.842377L3.36286 23.3692C3.13819 23.5067 2.92801 23.666 2.72508 23.8326H35.1288V23.8398Z"
      />
      <path
        className={logoBodyVariants({ tone })}
        d="M0.144951 28.8578C0.079723 29.2851 0.0434853 29.7123 0.0434853 30.1323L0 72.036C0 76.1778 1.95684 78.3936 5.26172 80.3631L39.4919 100.703L0.144951 28.8578Z"
      />
      <path
        className={logoBodyVariants({ tone })}
        d="M89.9203 28.7058L50.0588 101L86.6661 79.1539C88.7027 77.9374 90 75.0265 90 72.6442L89.9783 29.6037C89.9783 29.2923 89.9493 28.9954 89.913 28.6985L89.9203 28.7058Z"
      />
    </svg>
  );
}
