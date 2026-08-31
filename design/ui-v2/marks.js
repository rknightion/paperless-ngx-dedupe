/* m7kni product mark family — one construction, six marks.
 * Grid 72x72 · live area 8–64 · body zone lower-left · badge slot 16x16 at top-right (centre 56,14)
 * Stroke 2 (regular) / 4 (small cut, use at ≤24px) · corners rx 3 · butt caps · miter joins.
 * Every mark is currentColor + fill:none, so a single token colour drives it. */
const PM_BODY = {
  m7kni: '<rect x="9" y="25" width="38" height="38" rx="3"/><path d="M28 25V63M9 44H47"/>',
  brewmdm: '<rect x="9" y="27" width="28" height="34" rx="3"/><path d="M9 34h28"/><path d="M37 35h5a7 7 0 0 1 0 14h-5"/>',
  trustheader: '<rect x="9" y="27" width="38" height="28" rx="3"/><path d="M9 30l19 14 19-14"/>',
  portie: '<path d="M11 63V26a3 3 0 0 1 3-3h28a3 3 0 0 1 3 3v37"/><circle cx="38" cy="43" r="2.5" fill="currentColor" stroke="none"/>',
  backpocket: '<path d="M9 25v32a3 3 0 0 0 3 3h32a3 3 0 0 0 3-3V25"/><path d="M17 33V18a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v15"/><path d="M9 33h38"/>'
};
const PM_BADGE = {
  m7kni: '<rect x="49" y="7" width="14" height="14" rx="3"/>',
  brewmdm: '<path d="M49 14h14M56 7v14"/>',
  trustheader: '<circle cx="56" cy="14" r="7"/><circle cx="56" cy="14" r="2" fill="currentColor" stroke="none"/>',
  portie: '<path d="M49 14h14"/><path d="M57 8l6 6-6 6"/>',
  backpocket: '<path d="M49 15l5 5 9-12"/>'
};
const PM_NAME = { m7kni: 'm7kni', brewmdm: 'BrewMDM', trustheader: 'TrustHeader', portie: 'Portie', backpocket: 'Backpocket' };
function pmSvg(name, size, weight, part) {
  const w = weight || 2;
  const body = part === 'badge' ? '' : PM_BODY[name];
  const badge = part === 'body' ? '' : PM_BADGE[name];
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 72 72" fill="none" stroke="currentColor" stroke-width="' + w +
    '" stroke-linecap="butt" stroke-linejoin="miter" role="img" aria-label="' + (PM_NAME[name] || name) + ' mark">' + body + badge + '</svg>';
}
class PmMark extends HTMLElement {
  connectedCallback() { this.render(); }
  static get observedAttributes() { return ['name', 'size', 'weight', 'part-only']; }
  attributeChangedCallback() { if (this.isConnected) this.render(); }
  render() {
    const size = +(this.getAttribute('size') || 48);
    this.style.display = 'inline-flex';
    this.style.lineHeight = '0';
    this.innerHTML = pmSvg(this.getAttribute('name'), size, +(this.getAttribute('weight') || (size <= 24 ? 4 : 2)), this.getAttribute('part-only'));
  }
}
customElements.define('pm-mark', PmMark);

/* BrewMDM agent glyph — the menu-bar reduction. Drawn on its own 18px grid at
 * stroke 1.5, badge box dropped, plus glyph pulled tight to the cup. */
class PmAgentGlyph extends HTMLElement {
  connectedCallback() {
    const size = +(this.getAttribute('size') || 18);
    this.style.display = 'inline-flex';
    this.style.lineHeight = '0';
    this.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" role="img" aria-label="BrewMDM agent">' +
      '<rect x="2.75" y="6.25" width="8" height="8.5" rx="1"/><path d="M2.75 8.75h8"/>' +
      '<path d="M10.75 8.5h1.5a2.25 2.25 0 0 1 0 4.5h-1.5"/>' +
      '<path d="M11.5 4h4.75M13.875 1.625v4.75"/></svg>';
  }
}
customElements.define('pm-agent-glyph', PmAgentGlyph);
