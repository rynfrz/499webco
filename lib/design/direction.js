// Design Direction Engine.
//
// Replaces the single random "design seed" with a structured direction:
//   - what the administrator asked for (industry, personality, visual
//     preferences, a free-text design prompt, inspiration links)
//   - controlled variation across nine independent dimensions, each drawn
//     from a pool weighted by how well an option fits the brief
//   - locks, so a liked property survives a re-roll
//
// Every dimension has its own PRNG stream derived from (seed, dimension), so
// re-rolling or locking one never shifts the others. The resolved direction is
// stored with the website and reused for every page.

export const INDUSTRIES = [
  'Home Services', 'Construction', 'Automotive', 'Beauty & Wellness', 'Professional Services', 'Healthcare',
  'Restaurants & Hospitality', 'Retail', 'Creative Services', 'Real Estate', 'Technology', 'Other'
];

export const PERSONALITIES = [
  'Modern', 'Minimal', 'Elegant', 'Bold', 'Playful', 'Editorial', 'Luxury', 'Industrial',
  'Organic', 'Traditional', 'Friendly', 'Technical', 'Artistic', 'Premium', 'Rustic'
];

export const PREF_OPTIONS = {
  mode: [['auto', 'Let the design decide'], ['light', 'Light'], ['dark', 'Dark']],
  typePersonality: [
    ['auto', 'Let the design decide'], ['classic-serif', 'Classic serif'], ['modern-sans', 'Modern sans'],
    ['geometric', 'Geometric'], ['humanist', 'Warm humanist'], ['editorial', 'Editorial display'],
    ['condensed', 'Condensed & punchy'], ['slab', 'Slab & sturdy'], ['handcrafted', 'Handcrafted']
  ],
  imagery: [['balanced', 'Balanced'], ['image-led', 'Image-heavy'], ['type-led', 'Typography-heavy']],
  animation: [['subtle', 'Subtle'], ['none', 'None'], ['moderate', 'Moderate'], ['expressive', 'Expressive']],
  density: [['balanced', 'Balanced'], ['airy', 'Airy, generous whitespace'], ['compact', 'Compact, information-rich']]
};

// Map the existing business types onto the broader industry categories.
const TYPE_TO_INDUSTRY = {
  'Restaurant / Café': 'Restaurants & Hospitality', 'Bar / Brewery': 'Restaurants & Hospitality', 'Bakery / Dessert Shop': 'Restaurants & Hospitality',
  'Retail / Local Shop': 'Retail', 'Boutique / Clothing': 'Retail', 'Salon / Spa': 'Beauty & Wellness',
  'Insurance Agency': 'Professional Services', "Doctor's Office / Medical": 'Healthcare', 'Dentist / Orthodontist': 'Healthcare',
  'Law Firm': 'Professional Services', 'Accounting / Tax': 'Professional Services', 'Real Estate': 'Real Estate',
  'HVAC': 'Home Services', 'Roofing': 'Construction', 'Plumbing / Electrical': 'Home Services', 'Landscaping': 'Home Services',
  'Auto Repair': 'Automotive', 'Fitness / Gym': 'Beauty & Wellness', 'Other Local Business': 'Other'
};
export function industryFor(businessType) { return TYPE_TO_INDUSTRY[businessType] || 'Other'; }

// Sensible starting personalities per industry (only used when none are chosen).
const INDUSTRY_PERSONALITIES = {
  'Home Services': ['Friendly', 'Bold'], 'Construction': ['Industrial', 'Bold'], 'Automotive': ['Bold', 'Technical'],
  'Beauty & Wellness': ['Elegant', 'Organic'], 'Professional Services': ['Premium', 'Modern'], 'Healthcare': ['Friendly', 'Minimal'],
  'Restaurants & Hospitality': ['Editorial', 'Organic'], 'Retail': ['Playful', 'Modern'], 'Creative Services': ['Artistic', 'Editorial'],
  'Real Estate': ['Premium', 'Elegant'], 'Technology': ['Technical', 'Modern'], 'Other': ['Modern', 'Friendly']
};

// ---------------------------------------------------------------------------
// Variation dimensions. `fits` are personalities the option suits; `avoid`
// are personalities it clashes with; `needs`/`not` filter on preferences.
// ---------------------------------------------------------------------------

const o = (id, label, prompt, fits = [], extra = {}) => ({ id, label, prompt, fits, ...extra });

export const DIMENSIONS = {
  layout: {
    label: 'Layout composition',
    options: [
      o('editorial-grid', 'Editorial 12-column grid', 'Strict 12-column grid with wide margins; text sits in narrow measured columns while visuals span and deliberately break the grid in one or two places per page.', ['Editorial', 'Elegant', 'Premium', 'Luxury', 'Minimal']),
      o('asymmetric-split', 'Asymmetric splits', 'Asymmetric two-column compositions (roughly 7/5 or 5/7) that alternate sides down the page; content never sits dead-centre for long.', ['Modern', 'Bold', 'Artistic', 'Premium']),
      o('centered-calm', 'Centred and calm', 'A calm centred axis with narrow reading width, large vertical spacing and a few full-bleed moments for contrast.', ['Minimal', 'Elegant', 'Luxury', 'Organic']),
      o('bento', 'Bento mosaic', 'Bento-style mosaic blocks of mixed sizes for services and proof; each tile has one job and one focal point.', ['Modern', 'Technical', 'Playful', 'Friendly']),
      o('stacked-bands', 'Stacked full-width bands', 'Confident full-width bands, each with its own background treatment and a single clear message, like chapters.', ['Bold', 'Industrial', 'Friendly', 'Traditional']),
      o('offset-overlap', 'Offset and overlapping', 'Layered composition: panels overlap section boundaries, captions sit offset from their images, numerals peek behind headings.', ['Artistic', 'Editorial', 'Bold', 'Playful']),
      o('sidebar-rail', 'Persistent side rail', 'A slim persistent rail (index, contact shortcut or section labels) beside a wide content column on large screens, collapsing cleanly on mobile.', ['Technical', 'Editorial', 'Industrial', 'Modern']),
      o('magazine', 'Magazine spread', 'Magazine spreads: multi-column text, pull quotes, oversized intro paragraphs, image captions and running section labels.', ['Editorial', 'Traditional', 'Rustic', 'Elegant'])
    ]
  },
  typePairing: {
    label: 'Typography pairing',
    options: [
      o('fraunces-inter', 'Fraunces + Inter', '', ['Editorial', 'Organic', 'Friendly', 'Elegant'], { head: 'Fraunces', body: 'Inter', kind: 'classic-serif', headWeights: '400;600;700', bodyWeights: '400;500;600' }),
      o('playfair-source', 'Playfair Display + Source Sans 3', '', ['Elegant', 'Luxury', 'Traditional', 'Editorial'], { head: 'Playfair Display', body: 'Source Sans 3', kind: 'classic-serif', headWeights: '500;700;800', bodyWeights: '400;600' }),
      o('cormorant-mulish', 'Cormorant Garamond + Mulish', '', ['Luxury', 'Elegant', 'Organic'], { head: 'Cormorant Garamond', body: 'Mulish', kind: 'classic-serif', headWeights: '500;600;700', bodyWeights: '400;600' }),
      o('dmserif-dmsans', 'DM Serif Display + DM Sans', '', ['Premium', 'Friendly', 'Modern', 'Editorial'], { head: 'DM Serif Display', body: 'DM Sans', kind: 'editorial', headWeights: '400', bodyWeights: '400;500;700' }),
      o('instrument-serif-inter', 'Instrument Serif + Inter Tight', '', ['Editorial', 'Minimal', 'Artistic', 'Premium'], { head: 'Instrument Serif', body: 'Inter Tight', kind: 'editorial', headWeights: '400', bodyWeights: '400;500;600' }),
      o('space-grotesk-inter', 'Space Grotesk + Inter', '', ['Technical', 'Modern', 'Bold'], { head: 'Space Grotesk', body: 'Inter', kind: 'geometric', headWeights: '500;700', bodyWeights: '400;500;600' }),
      o('sora-inter', 'Sora + Inter', '', ['Modern', 'Technical', 'Friendly'], { head: 'Sora', body: 'Inter', kind: 'geometric', headWeights: '600;700;800', bodyWeights: '400;500;600' }),
      o('manrope-manrope', 'Manrope (single family)', '', ['Minimal', 'Modern', 'Premium'], { head: 'Manrope', body: 'Manrope', kind: 'modern-sans', headWeights: '600;700;800', bodyWeights: '400;500;600' }),
      o('bricolage-instrument', 'Bricolage Grotesque + Instrument Sans', '', ['Playful', 'Artistic', 'Bold', 'Modern'], { head: 'Bricolage Grotesque', body: 'Instrument Sans', kind: 'modern-sans', headWeights: '600;700;800', bodyWeights: '400;500;600' }),
      o('archivo-archivo', 'Archivo Black + Archivo', '', ['Bold', 'Industrial'], { head: 'Archivo Black', body: 'Archivo', kind: 'condensed', headWeights: '400', bodyWeights: '400;500;600' }),
      o('oswald-source', 'Oswald + Source Sans 3', '', ['Industrial', 'Bold', 'Traditional'], { head: 'Oswald', body: 'Source Sans 3', kind: 'condensed', headWeights: '500;600;700', bodyWeights: '400;600' }),
      o('barlow-barlow', 'Barlow Condensed + Barlow', '', ['Industrial', 'Technical', 'Bold'], { head: 'Barlow Condensed', body: 'Barlow', kind: 'condensed', headWeights: '600;700;800', bodyWeights: '400;500;600' }),
      o('zilla-work', 'Zilla Slab + Work Sans', '', ['Rustic', 'Traditional', 'Friendly', 'Industrial'], { head: 'Zilla Slab', body: 'Work Sans', kind: 'slab', headWeights: '500;600;700', bodyWeights: '400;500;600' }),
      o('roboto-slab-roboto', 'Roboto Slab + Roboto', '', ['Traditional', 'Technical', 'Rustic'], { head: 'Roboto Slab', body: 'Roboto', kind: 'slab', headWeights: '500;700;800', bodyWeights: '400;500;700' }),
      o('lora-work', 'Lora + Work Sans', '', ['Organic', 'Traditional', 'Friendly', 'Rustic'], { head: 'Lora', body: 'Work Sans', kind: 'humanist', headWeights: '500;600;700', bodyWeights: '400;500;600' }),
      o('nunito-nunito', 'Nunito (rounded, single family)', '', ['Friendly', 'Playful'], { head: 'Nunito', body: 'Nunito', kind: 'humanist', headWeights: '700;800;900', bodyWeights: '400;600;700' }),
      o('outfit-figtree', 'Outfit + Figtree', '', ['Friendly', 'Modern', 'Playful'], { head: 'Outfit', body: 'Figtree', kind: 'geometric', headWeights: '500;600;700', bodyWeights: '400;500;600' }),
      o('syne-outfit', 'Syne + Outfit', '', ['Artistic', 'Bold', 'Playful'], { head: 'Syne', body: 'Outfit', kind: 'editorial', headWeights: '600;700;800', bodyWeights: '400;500' }),
      o('libre-caslon-karla', 'Libre Caslon Text + Karla', '', ['Traditional', 'Elegant', 'Rustic', 'Editorial'], { head: 'Libre Caslon Text', body: 'Karla', kind: 'classic-serif', headWeights: '400;700', bodyWeights: '400;500;700' }),
      o('caveat-nunito', 'Caveat accents + Nunito Sans', '', ['Playful', 'Organic', 'Rustic'], { head: 'Nunito Sans', body: 'Nunito Sans', accent: 'Caveat', kind: 'handcrafted', headWeights: '700;800', bodyWeights: '400;600' })
    ]
  },
  colorArchitecture: {
    label: 'Colour architecture',
    options: [
      o('neutral-one-accent', 'Neutral with one decisive accent', 'Mostly neutral surfaces; a single accent colour appears only on actions and a few highlights, so it always means "act here".', ['Minimal', 'Premium', 'Modern', 'Luxury', 'Technical']),
      o('tinted-surfaces', 'Tinted surfaces', 'Backgrounds are softly tinted with the brand hue rather than pure white or grey; sections shift between two or three related tints.', ['Friendly', 'Organic', 'Elegant', 'Modern']),
      o('color-blocked', 'Colour-blocked sections', 'Whole sections are blocked in saturated brand colours with text set in a contrasting colour; neutral sections give the eye a rest between them.', ['Bold', 'Playful', 'Artistic', 'Friendly']),
      o('dark-luminous', 'Dark with luminous accents', 'A deep ink base (never pure black) with one luminous accent and restrained surface elevation instead of heavy borders.', ['Luxury', 'Technical', 'Bold', 'Premium', 'Industrial'], { mode: 'dark' }),
      o('duotone', 'Two-colour duotone', 'Exactly two brand colours plus neutrals, used in a consistent pairing: one for structure, one for emphasis.', ['Bold', 'Modern', 'Artistic', 'Editorial']),
      o('earth-layered', 'Layered earth tones', 'Layered natural tones (clay, sand, moss, charcoal) with warm off-white paper as the base.', ['Organic', 'Rustic', 'Traditional', 'Elegant'], { mode: 'light' }),
      o('monochrome-ink', 'Monochrome ink and paper', 'Near-monochrome: ink on paper with tonal greys; colour appears only in photography and one small signature detail.', ['Editorial', 'Minimal', 'Luxury', 'Artistic']),
      o('high-contrast-safety', 'High-contrast with a signal colour', 'Strong black/white contrast plus a single signal colour (safety orange, yellow or red) used on labels, numbers and actions.', ['Industrial', 'Bold', 'Technical', 'Traditional'])
    ]
  },
  palette: {
    label: 'Starting palette',
    options: [
      { id: 'ink-coral', label: 'Ink & Coral', mode: 'light', fits: ['Modern', 'Friendly', 'Bold'], bg: '#fbfaf8', surface: '#ffffff', text: '#14161c', muted: '#5d6370', accent: '#e4572e', accent2: '#17bebb', border: '#e6e3dd' },
      { id: 'forest-cream', label: 'Forest & Cream', mode: 'light', fits: ['Organic', 'Rustic', 'Traditional', 'Elegant'], bg: '#f6f2e8', surface: '#fffdf7', text: '#1e2a22', muted: '#5b665c', accent: '#2f5d47', accent2: '#c0843b', border: '#e2dccb' },
      { id: 'navy-brass', label: 'Navy & Brass', mode: 'light', fits: ['Premium', 'Traditional', 'Luxury', 'Elegant'], bg: '#f7f6f2', surface: '#ffffff', text: '#101b2d', muted: '#566072', accent: '#12325b', accent2: '#b08a3e', border: '#e3e0d6' },
      { id: 'clay-sand', label: 'Clay & Sand', mode: 'light', fits: ['Organic', 'Rustic', 'Friendly', 'Editorial'], bg: '#f8f1e7', surface: '#fffaf3', text: '#2a1d17', muted: '#6d5a50', accent: '#b4532a', accent2: '#5f7a5b', border: '#e8dccb' },
      { id: 'cobalt-paper', label: 'Cobalt & Paper', mode: 'light', fits: ['Modern', 'Technical', 'Bold', 'Minimal'], bg: '#f7f8fb', surface: '#ffffff', text: '#0e1424', muted: '#566079', accent: '#1f4fe0', accent2: '#ffb020', border: '#e1e5ee' },
      { id: 'plum-blush', label: 'Plum & Blush', mode: 'light', fits: ['Elegant', 'Luxury', 'Artistic', 'Playful'], bg: '#fbf5f4', surface: '#ffffff', text: '#2a1524', muted: '#6c5766', accent: '#6d2a57', accent2: '#d98c7a', border: '#eddfdd' },
      { id: 'sage-stone', label: 'Sage & Stone', mode: 'light', fits: ['Minimal', 'Organic', 'Elegant', 'Friendly'], bg: '#f4f5f1', surface: '#ffffff', text: '#1d231f', muted: '#5f6861', accent: '#55705c', accent2: '#b9794f', border: '#e0e3dc' },
      { id: 'signal-black', label: 'Signal Orange & Black', mode: 'light', fits: ['Industrial', 'Bold', 'Technical'], bg: '#f4f3f0', surface: '#ffffff', text: '#111111', muted: '#55524d', accent: '#f25c05', accent2: '#111111', border: '#dedbd5' },
      { id: 'teal-sun', label: 'Teal & Sun', mode: 'light', fits: ['Friendly', 'Playful', 'Modern'], bg: '#f3faf9', surface: '#ffffff', text: '#0c2a2e', muted: '#4e6a6d', accent: '#0e8f8a', accent2: '#f5a524', border: '#d9ecea' },
      { id: 'oxblood-ivory', label: 'Oxblood & Ivory', mode: 'light', fits: ['Traditional', 'Luxury', 'Editorial', 'Rustic'], bg: '#f8f4ec', surface: '#fffdf8', text: '#231614', muted: '#6a5853', accent: '#7c1f24', accent2: '#3d5a4c', border: '#e8e0d1' },
      { id: 'sky-graphite', label: 'Sky & Graphite', mode: 'light', fits: ['Technical', 'Minimal', 'Modern', 'Friendly'], bg: '#f5f8fa', surface: '#ffffff', text: '#18202a', muted: '#5a6673', accent: '#0f7cc2', accent2: '#2bb673', border: '#dfe6ec' },
      { id: 'mustard-ink', label: 'Mustard & Ink', mode: 'light', fits: ['Artistic', 'Editorial', 'Playful', 'Bold'], bg: '#faf6ea', surface: '#fffdf5', text: '#16171b', muted: '#5c5d63', accent: '#d99a06', accent2: '#2b3a67', border: '#e9e2cf' },
      { id: 'midnight-gold', label: 'Midnight & Gold', mode: 'dark', fits: ['Luxury', 'Premium', 'Elegant'], bg: '#0e1117', surface: '#161b24', text: '#f3efe6', muted: '#a39f95', accent: '#d7a84a', accent2: '#7aa2c9', border: '#262d3a' },
      { id: 'carbon-lime', label: 'Carbon & Lime', mode: 'dark', fits: ['Technical', 'Bold', 'Modern', 'Industrial'], bg: '#101211', surface: '#181b19', text: '#eef2ec', muted: '#9aa39b', accent: '#b6f03c', accent2: '#3cc8f0', border: '#272c28' },
      { id: 'espresso-cream', label: 'Espresso & Cream', mode: 'dark', fits: ['Rustic', 'Organic', 'Editorial', 'Traditional'], bg: '#1a1411', surface: '#241c17', text: '#f6ecdf', muted: '#b3a595', accent: '#e0995a', accent2: '#8fae8b', border: '#33281f' },
      { id: 'ink-ember', label: 'Ink & Ember', mode: 'dark', fits: ['Bold', 'Industrial', 'Artistic'], bg: '#111318', surface: '#191c23', text: '#f2f3f5', muted: '#9a9fab', accent: '#ff5a36', accent2: '#ffc145', border: '#282c36' },
      { id: 'deep-teal-rose', label: 'Deep Teal & Rose', mode: 'dark', fits: ['Elegant', 'Artistic', 'Premium', 'Playful'], bg: '#0d1a1c', surface: '#132527', text: '#eef5f3', muted: '#9bb0ad', accent: '#f08c9b', accent2: '#5fd0c0', border: '#1f3639' }
    ]
  },
  sectionRhythm: {
    label: 'Section rhythm',
    options: [
      o('alternating-density', 'Alternating dense and open', 'Alternate a dense, information-rich section with a spacious single-idea section so the page breathes in a steady rhythm.', ['Editorial', 'Modern', 'Premium']),
      o('long-scroll-chapters', 'Chapters', 'Treat each section as a chapter with a small label or number, a strong opening line and a clear ending before the next begins.', ['Editorial', 'Elegant', 'Traditional', 'Luxury']),
      o('punchy-short', 'Short and punchy', 'Short sections with one message each and frequent calls to action; nothing takes more than one screen on desktop.', ['Bold', 'Friendly', 'Playful', 'Industrial']),
      o('crescendo', 'Crescendo', 'Start quiet and build: restrained opening, growing visual intensity through the middle, strongest contrast at the final call to action.', ['Artistic', 'Luxury', 'Bold']),
      o('anchored-bands', 'Anchored colour bands', 'A repeating A-B-A pattern of background treatments anchors the page; the same treatment always signals the same kind of content.', ['Friendly', 'Technical', 'Modern', 'Organic']),
      o('quiet-uniform', 'Quiet and uniform', 'Uniform calm spacing with thin dividers; variation comes from typography and imagery rather than background changes.', ['Minimal', 'Elegant', 'Organic', 'Rustic'])
    ]
  },
  navPattern: {
    label: 'Navigation pattern',
    options: [
      o('classic-bar', 'Classic top bar', 'Logo left, links right, one filled action button; becomes solid with a hairline border after scrolling.', ['Traditional', 'Friendly', 'Modern', 'Premium']),
      o('centered-logo', 'Centred logo', 'Logo centred with links split either side on desktop; a tidy stacked menu on mobile.', ['Elegant', 'Luxury', 'Editorial', 'Organic']),
      o('pill-floating', 'Floating pill', 'A floating rounded navigation bar inset from the page edges with a subtle shadow.', ['Modern', 'Playful', 'Friendly', 'Technical']),
      o('utility-strip', 'Utility strip + bar', 'A slim utility strip (phone, hours or service area) above the main bar, so key facts are always visible.', ['Industrial', 'Traditional', 'Bold', 'Friendly']),
      o('minimal-index', 'Minimal index', 'A minimal text-only bar: small uppercase links with generous letter-spacing and an underlined current page.', ['Minimal', 'Editorial', 'Artistic', 'Luxury']),
      o('bold-block', 'Bold block header', 'A solid colour header block with a heavy wordmark and high-contrast links; the action button inverts the header colours.', ['Bold', 'Industrial', 'Playful', 'Artistic'])
    ]
  },
  motif: {
    label: 'Visual motif',
    options: [
      o('hairlines', 'Hairlines and rules', 'Thin rules, ticks and corner marks organise content like a well-set printed page.', ['Editorial', 'Minimal', 'Technical', 'Elegant', 'Luxury']),
      o('oversized-numerals', 'Oversized numerals', 'Large outlined or tinted numerals sit behind or beside headings to number services, steps and reasons.', ['Bold', 'Editorial', 'Industrial', 'Modern']),
      o('soft-shapes', 'Soft organic shapes', 'Soft blob and arch shapes frame images and sit quietly behind content; edges are rounded generously.', ['Organic', 'Friendly', 'Playful', 'Elegant']),
      o('grid-paper', 'Blueprint grid', 'A faint grid or blueprint pattern appears in a few backgrounds, with small coordinate-style labels.', ['Technical', 'Industrial', 'Modern']),
      o('stamps-badges', 'Stamps and badges', 'Circular stamps, ribbons and badge shapes carry guarantees, years in business and short claims.', ['Traditional', 'Rustic', 'Friendly', 'Industrial']),
      o('hand-drawn', 'Hand-drawn accents', 'Hand-drawn SVG underlines, arrows and circles emphasise a few key words.', ['Playful', 'Artistic', 'Friendly', 'Organic', 'Rustic']),
      o('diagonal-cuts', 'Diagonal cuts', 'Angled section edges and slanted colour blocks add motion without animation.', ['Bold', 'Industrial', 'Modern', 'Artistic']),
      o('framed-panels', 'Framed panels', 'Content sits in clearly framed panels with inner margins, like gallery mounts.', ['Luxury', 'Elegant', 'Premium', 'Traditional'])
    ]
  },
  imageTreatment: {
    label: 'Image treatment',
    options: [
      o('full-bleed', 'Full-bleed photography', 'Photography runs edge to edge with text set over a calm area or in an adjacent panel, never over busy detail.', ['Bold', 'Luxury', 'Editorial'], { needs: 'photos' }),
      o('framed-offset', 'Framed and offset', 'Images sit in frames slightly offset from a coloured backing shape, with short captions.', ['Elegant', 'Friendly', 'Organic', 'Traditional'], { needs: 'photos' }),
      o('arch-masks', 'Arch and rounded masks', 'Images are masked into arches, pills or generously rounded rectangles.', ['Organic', 'Playful', 'Elegant', 'Friendly'], { needs: 'photos' }),
      o('duotone-tint', 'Tinted duotone', 'Photographs are unified with a brand-tinted overlay so mixed sources feel like one set.', ['Modern', 'Bold', 'Artistic', 'Industrial'], { needs: 'photos' }),
      o('collage-grid', 'Collage grid', 'Several images arranged in an uneven collage grid with small gaps.', ['Artistic', 'Editorial', 'Playful', 'Rustic'], { needs: 'photos' }),
      o('type-as-image', 'Typography as the image', 'No photography in key areas: oversized type, colour fields and simple SVG illustration carry the visual weight.', ['Minimal', 'Editorial', 'Technical', 'Bold', 'Modern'], { needs: 'none' }),
      o('pattern-panels', 'Pattern and texture panels', 'Geometric or line patterns built in SVG/CSS stand in where photography is unavailable.', ['Industrial', 'Technical', 'Traditional', 'Playful', 'Premium'], { needs: 'none' })
    ]
  },
  cardTreatment: {
    label: 'Card treatment',
    options: [
      o('borderless-rows', 'Borderless rows', 'No boxes: items are rows separated by hairlines with generous spacing and strong type.', ['Minimal', 'Editorial', 'Luxury', 'Elegant']),
      o('outlined-flat', 'Outlined, flat', 'Flat cards with a 1px outline and square or barely rounded corners; no shadows.', ['Technical', 'Modern', 'Industrial', 'Premium']),
      o('soft-elevated', 'Soft elevated', 'Softly rounded cards with one gentle, wide shadow and a tinted hover state.', ['Friendly', 'Modern', 'Organic']),
      o('solid-color', 'Solid colour tiles', 'Solid colour tiles in the brand palette with contrasting text; sizes vary.', ['Bold', 'Playful', 'Artistic']),
      o('ticket-label', 'Tickets and labels', 'Cards shaped like tickets, tags or index cards with a label strip.', ['Rustic', 'Traditional', 'Playful', 'Industrial']),
      o('inset-panels', 'Inset panels', 'Panels inset into a tinted section background, with a thin inner border.', ['Premium', 'Elegant', 'Luxury', 'Traditional'])
    ]
  },
  interaction: {
    label: 'Interaction pattern',
    options: [
      o('static-precise', 'Still and precise', 'No scroll animation; crisp hover and focus states only.', ['Minimal', 'Traditional', 'Technical'], { level: 0 }),
      o('fade-rise', 'Gentle fade and rise', 'Sections fade and rise a few pixels into view once; hovers shift colour and underline.', ['Elegant', 'Premium', 'Organic', 'Friendly', 'Luxury'], { level: 1 }),
      o('staggered-reveal', 'Staggered reveals', 'Grid items reveal in a short stagger; buttons have a small press response; numbers count up once.', ['Modern', 'Friendly', 'Bold', 'Technical'], { level: 2 }),
      o('underline-draw', 'Drawn underlines', 'Links and key words draw an underline on hover; images scale subtly inside their frames.', ['Editorial', 'Artistic', 'Elegant', 'Minimal'], { level: 1 }),
      o('marquee-motion', 'Marquee and motion strips', 'A slow marquee strip for proof points, plus lively hover lifts on cards.', ['Playful', 'Bold', 'Artistic', 'Industrial'], { level: 3 }),
      o('sticky-progress', 'Sticky labels', 'Section labels stick while their content scrolls; the header condenses on scroll.', ['Technical', 'Editorial', 'Modern', 'Premium'], { level: 2 })
    ]
  }
};

export const DIMENSION_KEYS = Object.keys(DIMENSIONS);

const ANIMATION_LEVEL = { none: 0, subtle: 1, moderate: 2, expressive: 3 };

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function newSeed() { return Math.floor(Math.random() * 2147483647); }

function weightFor(opt, dir, dim, ctx) {
  const p = dir.personalities || [];
  let w = 1;
  for (const f of opt.fits || []) if (p.includes(f)) w += 2.5;
  for (const a of opt.avoid || []) if (p.includes(a)) w *= 0.2;
  const prefs = dir.prefs || {};
  if (dim === 'colorArchitecture' || dim === 'palette') {
    if (prefs.mode === 'dark') w *= opt.mode === 'dark' ? 6 : opt.mode === 'light' ? 0 : 1;
    if (prefs.mode === 'light') w *= opt.mode === 'dark' ? 0 : 1.2;
    if (!prefs.mode || prefs.mode === 'auto') w *= opt.mode === 'dark' ? 0.55 : 1; // bright by default
  }
  if (dim === 'typePairing' && prefs.typePersonality && prefs.typePersonality !== 'auto') {
    w *= opt.kind === prefs.typePersonality ? 8 : 0.15;
  }
  if (dim === 'imageTreatment') {
    const hasPhotos = !!ctx.hasPhotos;
    if (opt.needs === 'photos' && !hasPhotos) w *= 0.05;
    if (opt.needs === 'none' && hasPhotos && prefs.imagery !== 'type-led') w *= 0.3;
    if (prefs.imagery === 'type-led') w *= opt.needs === 'none' ? 5 : 0.3;
    if (prefs.imagery === 'image-led') w *= opt.needs === 'photos' ? 3 : 0.4;
  }
  if (dim === 'interaction') {
    const want = ANIMATION_LEVEL[prefs.animation ?? 'subtle'] ?? 1;
    const d = Math.abs((opt.level ?? 1) - want);
    w *= d === 0 ? 5 : d === 1 ? 1 : 0.1;
    if (want === 0 && (opt.level ?? 1) > 0) w = 0;
  }
  if (dim === 'layout' || dim === 'sectionRhythm') {
    if (prefs.density === 'airy' && ['centered-calm', 'editorial-grid', 'quiet-uniform', 'long-scroll-chapters'].includes(opt.id)) w *= 2;
    if (prefs.density === 'compact' && ['bento', 'sidebar-rail', 'magazine', 'punchy-short', 'alternating-density'].includes(opt.id)) w *= 2;
  }
  return w;
}

function weightedPick(options, weights, rnd) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return options[Math.floor(rnd() * options.length)];
  let r = rnd() * total;
  for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) return options[i]; }
  return options[options.length - 1];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const clean = (v, max = 4000) => String(v ?? '').slice(0, max);

/** Normalise any stored/partial direction into a complete, valid one. */
export function normalizeDirection(input = {}, ctx = {}) {
  const d = input && typeof input === 'object' ? input : {};
  const industry = INDUSTRIES.includes(d.industry) ? d.industry : industryFor(ctx.businessType);
  let personalities = Array.isArray(d.personalities) ? d.personalities.filter(p => PERSONALITIES.includes(p)).slice(0, 5) : [];
  const prefsIn = d.prefs || {};
  const pick = (key, def) => (PREF_OPTIONS[key].some(([v]) => v === prefsIn[key]) ? prefsIn[key] : def);
  const out = {
    version: 2,
    industry,
    personalities,
    prefs: {
      mode: pick('mode', 'auto'),
      typePersonality: pick('typePersonality', 'auto'),
      imagery: pick('imagery', 'balanced'),
      animation: pick('animation', 'subtle'),
      density: pick('density', 'balanced'),
      palette: clean(prefsIn.palette, 300),
      tone: clean(prefsIn.tone, 300)
    },
    customPrompt: clean(d.customPrompt, 6000),
    inspiration: Array.isArray(d.inspiration) ? d.inspiration.map(u => clean(u, 300)).filter(Boolean).slice(0, 6) : [],
    seed: Number.isFinite(d.seed) ? d.seed >>> 0 : newSeed(),
    choices: {},
    locks: {},
    presetId: d.presetId || null,
    presetName: d.presetName ? clean(d.presetName, 80) : null
  };
  for (const dim of DIMENSION_KEYS) {
    const id = d.choices?.[dim];
    if (id && DIMENSIONS[dim].options.some(x => x.id === id)) out.choices[dim] = id;
    if (d.locks?.[dim]) out.locks[dim] = true;
  }
  return resolveDirection(out, ctx);
}

/** Fill every dimension that has no choice yet (deterministic for a given seed). */
export function resolveDirection(direction, ctx = {}) {
  const d = { ...direction, choices: { ...(direction.choices || {}) }, locks: { ...(direction.locks || {}) } };
  const effective = { ...d, personalities: d.personalities?.length ? d.personalities : (INDUSTRY_PERSONALITIES[d.industry] || INDUSTRY_PERSONALITIES.Other) };
  for (const dim of DIMENSION_KEYS) {
    if (d.choices[dim]) continue;
    const rnd = mulberry32(hashStr(`${d.seed}:${dim}`));
    let options = DIMENSIONS[dim].options;
    if (dim === 'palette') {
      // Keep the palette consistent with the colour architecture's mode.
      const arch = DIMENSIONS.colorArchitecture.options.find(x => x.id === d.choices.colorArchitecture);
      if (arch?.mode) options = options.filter(x => x.mode === arch.mode);
    }
    if (dim === 'typePairing' && d.prefs?.typePersonality && d.prefs.typePersonality !== 'auto') {
      // An explicit typography personality is a hard constraint, not a nudge.
      const exact = options.filter(x => x.kind === d.prefs.typePersonality);
      if (exact.length) options = exact;
    }
    const weights = options.map(opt => weightFor(opt, effective, dim, ctx));
    d.choices[dim] = weightedPick(options, weights, rnd).id;
  }
  return d;
}

/** Re-roll every unlocked dimension (or just the listed ones) with a new seed. */
export function rerollDirection(direction, ctx = {}, { only = null, seed = newSeed() } = {}) {
  const d = { ...direction, seed, choices: { ...(direction.choices || {}) } };
  for (const dim of DIMENSION_KEYS) {
    if (d.locks?.[dim]) continue;
    if (only && !only.includes(dim)) continue;
    delete d.choices[dim];
  }
  return resolveDirection(d, ctx);
}

export function defaultDirection(businessType, ctx = {}) {
  return normalizeDirection({}, { ...ctx, businessType });
}

/** Carry a pre-2.0 design seed forward as free-text guidance. */
export function directionFromLegacySeed(seed, businessType, ctx = {}) {
  if (!seed) return defaultDirection(businessType, ctx);
  const notes = [seed.direction, seed.hero && `Hero idea: ${seed.hero}`, seed.motif && `Layout motif: ${seed.motif}`].filter(Boolean).join('\n');
  return normalizeDirection({ seed: seed.seedNum, customPrompt: notes ? `Carried over from the original art-direction seed:\n${notes}` : '' }, { ...ctx, businessType });
}

export function choiceOf(direction, dim) {
  return DIMENSIONS[dim].options.find(x => x.id === direction.choices?.[dim]) || DIMENSIONS[dim].options[0];
}

/** Human-readable summary (admin UI + job log). */
export function describeDirection(direction) {
  return DIMENSION_KEYS.map(dim => {
    const c = choiceOf(direction, dim);
    return { key: dim, label: DIMENSIONS[dim].label, choice: c.label, id: c.id, locked: !!direction.locks?.[dim] };
  });
}

export function paletteOf(direction) {
  const p = choiceOf(direction, 'palette');
  return { name: p.label, mode: p.mode, bg: p.bg, surface: p.surface, text: p.text, muted: p.muted, accent: p.accent, accent2: p.accent2, border: p.border };
}

export function fontsOf(direction) {
  const t = choiceOf(direction, 'typePairing');
  return { head: t.head, body: t.body, accent: t.accent || null, headWeights: t.headWeights, bodyWeights: t.bodyWeights };
}

/** The art-direction block injected into the design-stage prompt. */
export function directionPromptBlock(direction, ctx = {}) {
  const d = direction;
  const lines = [];
  const pers = d.personalities?.length ? d.personalities : (INDUSTRY_PERSONALITIES[d.industry] || []);
  lines.push(`Industry category: ${d.industry}`);
  lines.push(`Design personality: ${pers.join(', ')}${d.personalities?.length ? '' : ' (default for this industry)'}`);
  const pr = d.prefs || {};
  const label = (key, v) => (PREF_OPTIONS[key].find(([id]) => id === v) || [v, v])[1];
  lines.push(`Light/dark: ${label('mode', pr.mode)}`);
  if (pr.palette) lines.push(`Palette / colour direction from the administrator: ${pr.palette}`);
  if (pr.typePersonality && pr.typePersonality !== 'auto') lines.push(`Typography personality: ${label('typePersonality', pr.typePersonality)}`);
  lines.push(`Imagery balance: ${label('imagery', pr.imagery)}`);
  lines.push(`Animation intensity: ${label('animation', pr.animation)}`);
  lines.push(`Layout density: ${label('density', pr.density)}`);
  if (pr.tone) lines.push(`Brand tone: ${pr.tone}`);
  lines.push('');
  lines.push('Structured variation for THIS site (follow each one; together they are what makes this site unlike the last one):');
  for (const dim of DIMENSION_KEYS) {
    const c = choiceOf(d, dim);
    if (dim === 'typePairing') {
      lines.push(`- Typography pairing: headings in "${c.head}", body in "${c.body}"${c.accent ? `, handwritten accents in "${c.accent}"` : ''} (Google Fonts).`);
    } else if (dim === 'palette') {
      lines.push(`- Starting palette "${c.label}" (${c.mode}): bg ${c.bg}, surface ${c.surface}, text ${c.text}, muted ${c.muted}, accent ${c.accent}, accent-2 ${c.accent2}, border ${c.border}. Adjust hues to honour the logo colours and any palette direction above, keeping WCAG AA contrast.`);
    } else {
      lines.push(`- ${DIMENSIONS[dim].label}: ${c.label} — ${c.prompt}`);
    }
  }
  if (ctx.logoColors?.length) lines.push(`\nLogo colours to harmonise with: ${ctx.logoColors.join(', ')}.`);
  if (d.inspiration?.length) lines.push(`\nInspiration references supplied by the administrator (take the spirit, never copy): ${d.inspiration.join(', ')}`);
  if (d.customPrompt?.trim()) {
    lines.push('');
    lines.push('CUSTOM DESIGN PROMPT FROM THE ADMINISTRATOR (highest priority — follow it wherever it does not harm usability or accessibility):');
    lines.push(d.customPrompt.trim());
  }
  return lines.join('\n');
}

/** What gets saved as a named preset: the reusable parts, not the per-site seed. */
export function presetConfigFrom(direction) {
  const d = normalizeDirection(direction);
  return {
    version: 2, industry: d.industry, personalities: d.personalities, prefs: d.prefs,
    customPrompt: d.customPrompt, inspiration: d.inspiration, choices: d.choices, locks: d.locks
  };
}

/** Apply a preset to a project: locked properties are kept exactly, the rest re-rolled. */
export function applyPreset(presetConfig, ctx = {}, { presetId = null, presetName = null, keepChoices = true } = {}) {
  const base = { ...presetConfig, presetId, presetName, seed: newSeed() };
  if (!keepChoices) {
    const choices = {};
    for (const dim of DIMENSION_KEYS) if (presetConfig.locks?.[dim] && presetConfig.choices?.[dim]) choices[dim] = presetConfig.choices[dim];
    base.choices = choices;
  }
  return normalizeDirection(base, ctx);
}

export function directionOptionsForUi() {
  return {
    industries: INDUSTRIES,
    personalities: PERSONALITIES,
    prefs: PREF_OPTIONS,
    dimensions: DIMENSION_KEYS.map(k => ({
      key: k, label: DIMENSIONS[k].label,
      options: DIMENSIONS[k].options.map(x => ({ id: x.id, label: x.label, prompt: x.prompt || '', mode: x.mode || null, swatch: k === 'palette' ? [x.bg, x.surface, x.text, x.accent, x.accent2] : null }))
    }))
  };
}
