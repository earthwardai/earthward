import { useState } from "react";

const SITE = "https://earthwardai.com";

/** Tags a link so the admin dashboard can tell which network a visitor came from. */
const tagged = (path: string, source: string, campaign: string) =>
  `${SITE}${path}${path.includes("?") ? "&" : "?"}utm_source=${source}&utm_medium=social&utm_campaign=${campaign}`;

/**
 * Plain share links, no third-party scripts: nothing loads from the networks
 * until a visitor clicks, which keeps the page fast and the CSP strict.
 */
export function Share({ path, text, campaign, label = "Share" }: { path: string; text: string; campaign: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;
  const links = [
    { name: "X", href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(tagged(path, "x", campaign))}` },
    { name: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(tagged(path, "linkedin", campaign))}` },
    { name: "WhatsApp", href: `https://wa.me/?text=${enc(`${text} ${tagged(path, "whatsapp", campaign)}`)}` },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(tagged(path, "facebook", campaign))}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(tagged(path, "copy", campaign));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the visible links still work */
    }
  }

  return (
    <div className="share" role="group" aria-label={label}>
      <span className="share-label">{label}</span>
      {links.map((l) => (
        <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer" data-track={`share-${l.name.toLowerCase()}-${campaign}`}>
          {l.name}
        </a>
      ))}
      <button type="button" onClick={copy} data-track={`share-copy-${campaign}`}>
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
