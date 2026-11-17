import styles from "./Footer.module.css";

const groups = [
  { title: "Explore", links: [["Bottle reports", "/#drops"], ["Local coverage", "/coverage"], ["Membership", "/pricing"], ["Get the app", "/#download"]] },
  { title: "Resources", links: [["FAQ", "/#faq"], ["Gift membership help", "/gift"], ["Retailer login", "/retailers/login"], ["Support", "/support"]] },
  { title: "Legal", links: [["Privacy policy", "/legal/privacy"], ["Terms of service", "/legal/terms"], ["Data & alcohol disclaimer", "/legal/disclaimer"]] },
];

const socialLinks = [
  { label: "Facebook group", href: "https://www.facebook.com/share/g/1BTYhwxSwC/?mibextid=wwXIfr", icon: FacebookIcon },
  { label: "Instagram", href: "https://www.instagram.com/bourbonsignal", icon: InstagramIcon },
];

function FacebookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="currentColor">
      <path d="M13.7 22v-8.55h2.88l.43-3.34H13.7V7.98c0-.97.27-1.63 1.66-1.63h1.77V3.37c-.31-.04-1.36-.13-2.58-.13-2.55 0-4.3 1.56-4.3 4.42v2.45H7.37v3.34h2.88V22h3.45Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.4" cy="6.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer id="site-footer" className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.columns}>
          <div>
            <a className={styles.wordmark} href="/">BOURBON SIGNAL<span>.</span></a>
            <nav className={styles.social} aria-label="Social media">
              {socialLinks.map(({ label, href, icon: Icon }) => (
                <a key={label} href={href} aria-label={label} target="_blank" rel="noopener noreferrer"><Icon /></a>
              ))}
            </nav>
          </div>
          {groups.map(group => <nav key={group.title} aria-label={group.title}>
            <h2>{group.title}</h2>
            {group.links.map(([label, href]) => <a className={styles.link} key={href} href={href}>{label}</a>)}
          </nav>)}
        </div>
        <p className={styles.partner}>Retailer or distillery?{" "}
          <a href="/retailers">Partner with Bourbon Signal <span aria-hidden="true">⟶</span></a>
        </p>
        <div className={styles.legal}>
          <p>© 2026 Todd Digital Ventures LLC</p>
          <p>For ages 21 and up. Please drink responsibly.</p>
        </div>
      </div>
    </footer>
  );
}
