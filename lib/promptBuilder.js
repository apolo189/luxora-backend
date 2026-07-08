/**
 * Builds a single text editing instruction for the Gemini image-editing
 * model, enforcing Luxora's "obedience priority" rule: the color/material/
 * style direction must be IDENTICAL across all 4 variants — only intensity
 * (Safe -> Wow) may change. Because this model edits the whole photo from a
 * text instruction (no mask required), a single call can update walls AND
 * floor together in one pass, whichever the chosen scope requires.
 *
 * PROMPT STYLE NOTE (important — read before changing wording):
 * An earlier version of this file used an ALL-CAPS, labeled, checklist-style
 * structure ("KEEP UNCHANGED:", "REQUIRED CHANGES:", a repeated "Reminder:"
 * at the end) to try to improve obedience. Real-world testing against the
 * live model showed that backfired badly — it produced near-zero visible
 * change across all 4 variants (worse than the plain version before it). A
 * separately, independently-tested prompt that DID work reliably was long
 * and specific but written as ONE flowing, natural sentence per idea — the
 * way you'd brief a real interior designer, not a technical rule list. Every
 * prompt below follows that natural, single-mention style: no section
 * labels, no repeating the same instruction twice.
 */

// Intensity presets: language-only differences (never touch color/material).
// Each preset ends with a short, naturally-worded reminder to leave existing
// furniture/objects untouched, woven into the same flowing sentence rather
// than a separate rule sentence. This used to live only in the "wow" preset
// (the most dramatic wording, and the one testing showed was most prone to
// hallucinating staged furniture not present in the source photo), but the
// same risk can appear at any intensity, so a brief version of the same
// reminder is now present in all four.
const VARIANT_INTENSITY = {
  safe: {
    styleModifiers: 'a clean, faithful, true-to-life reproduction with realistic, unembellished lighting — a conservative, safe preview of the exact choices, keeping every piece of furniture and every object exactly as shown in the original photo'
  },
  elegant: {
    styleModifiers: 'a refined, polished look with softly enhanced natural lighting and a subtle tasteful sheen, keeping every piece of furniture and every object exactly as shown in the original photo'
  },
  premium: {
    styleModifiers: 'an elevated, high-end material feel with richer contrast, warm depth, and editorial-photography-quality lighting, keeping every piece of furniture and every object exactly as shown in the original photo'
  },
  wow: {
    styleModifiers: 'maximum showroom drama — bold contrast, luxurious and striking, magazine-cover-quality dramatic lighting and material finish, while remaining strictly photorealistic and faithful to the real room shown, with every piece of furniture and object kept exactly as it appears in the original photo and all of the drama coming only from lighting and finish quality'
  }
};

const STYLE_LABELS = {
  minimal: 'minimal, clean, quiet, restrained',
  warm: 'warm, inviting, soft, natural',
  'modern-premium': 'sharp, elevated, modern premium',
  luxury: 'luxury, rich materials, high-end',
  contemporary: 'balanced, on-trend, contemporary',
  'soft-organic': 'soft organic, textural, natural forms'
};

// Furniture handling instructions, folded into the prompt when the user
// asks to declutter the room or add new furniture. Left empty for "keep"
// (the default), which means "do not mention furniture at all" so the
// model's default behavior (leave everything else untouched) applies.
const FURNITURE_INSTRUCTIONS = {
  keep: '',
  declutter: 'Completely declutter this room: physically remove every piece of furniture, every decor item, every loose object, towel, plant, dish, and any clutter visible anywhere in the photo, including on countertops, floors, tables, and chairs, leaving a bare, clean, professionally staged empty room that shows only the architectural shell (walls, floor, ceiling, windows, doors, built-in cabinetry/fixtures).',
  furnish: 'Furnish this room with complete, tasteful, appropriately-scaled furniture and decor suited to this room type and the design style described below (such as seating, tables, rugs, and lighting as appropriate), arranged realistically for the space and camera angle shown.'
};

/**
 * Turns a terse catalog design/finish name (e.g. "High-Gloss Luxury Wall",
 * "Polished Marble", "Herringbone Wood") into a short, concrete, sensory
 * description (glossy sheen, veining, grain, pattern, etc). Image-editing
 * models respond far more reliably to vivid natural-language material
 * descriptions than to abstract catalog labels or hex codes alone — this
 * mirrors the kind of language used in a manually-tested prompt that
 * reliably worked ("glossy acrylic paint sheen that reflects light softly",
 * "black marble veining accented with thin gold veins", etc.) instead of a
 * generic style name.
 */
function describeFinishHints(designName) {
  const d = (designName || '').toLowerCase();
  const hints = [];
  if (d.includes('gloss') || d.includes('polish')) hints.push('a glossy, light-reflective sheen');
  if (d.includes('matte') || (d.includes('smooth') && !d.includes('gloss'))) hints.push('a smooth matte finish');
  if (d.includes('marble')) hints.push('soft, natural stone veining');
  if (d.includes('travertine') || d.includes('limestone') || d.includes('terrazzo') || (d.includes('stone') && !d.includes('marble'))) hints.push('natural stone texture with subtle color variation');
  if (d.includes('wood') || d.includes('plank') || d.includes('oak') || d.includes('walnut')) hints.push('visible natural wood grain texture');
  if (d.includes('herringbone') || d.includes('chevron')) hints.push('laid in a distinct herringbone/chevron pattern');
  if (d.includes('concrete') || d.includes('microcement')) hints.push('a seamless, industrial-smooth concrete-look finish');
  if (d.includes('texture') || d.includes('stucco') || d.includes('plaster') || d.includes('limewash') || d.includes('venetian')) hints.push('a tactile, hand-applied textured surface');
  if (d.includes('wallpaper')) hints.push('a richly patterned decorative surface');
  if (d.includes('panel') || d.includes('slat') || d.includes('fluted') || d.includes('wainscoting') || d.includes('cladding')) hints.push('distinct three-dimensional paneling/molding detail, not a flat painted surface');
  return hints.join(', ');
}

/**
 * Returns ONE flowing clause (no labels, no repetition) describing the
 * wall/floor change(s) required for this config — written the way you'd
 * brief a real interior designer in a single natural sentence, e.g. "repaint
 * the walls a dark charcoal gray color with subtle elegant white/gray marble
 * veining, finished with a glossy acrylic paint sheen... and replace the
 * floor entirely with polished white marble slab flooring...". This mirrors
 * the phrasing style of a prompt independently confirmed to work reliably
 * against this model — plain, specific, natural language beats an ALL-CAPS
 * labeled checklist structure, which real-world testing showed can cause
 * the model to under-apply or skip the edit entirely.
 */
function describeScope(config) {
  const wallHints = describeFinishHints(config.wallDesign);
  const floorHints = describeFinishHints(config.floorDesign);
  const clauses = [];

  if (config.wallColorHex && (config.scope === 'walls-only' || config.scope === 'walls-floors')) {
    clauses.push(`repaint the walls a "${config.wallColorName}" color (hex ${config.wallColorHex})${wallHints ? `, with ${wallHints}` : ''}, in a "${config.wallDesign}" style`);
  }
  if (config.wallColorHex && config.scope === 'accent-wall') {
    clauses.push(`repaint only the single most visually prominent feature wall — leaving every other wall exactly as it appears in the original photo — a "${config.wallColorName}" color (hex ${config.wallColorHex})${wallHints ? `, with ${wallHints}` : ''}, in a "${config.wallDesign}" style`);
  }
  if (config.floorColorHex && (config.scope === 'floors-only' || config.scope === 'walls-floors')) {
    clauses.push(`replace the flooring entirely with a "${config.floorColorName}" floor (hex ${config.floorColorHex})${floorHints ? `, featuring ${floorHints}` : ''}, in a "${config.floorDesign}" finish`);
  }

  if (!clauses.length) return '';
  // Join as one natural sentence: "repaint the walls ... and replace the
  // flooring ..." (only one "and" ever needed here, since there are at most
  // two clauses — wall and floor).
  const joined = clauses.join(' and ');
  return joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
}

/**
 * Builds a STANDALONE, furniture-only editing instruction, used as "step 1"
 * of a two-step pipeline when furnitureMode is not 'keep'. Experience showed
 * that asking Gemini to change furniture AND wall/floor color in one single
 * instruction causes it to frequently skip or under-apply the furniture
 * change (it prioritizes the color/material edit). Splitting into two
 * separate, focused edit calls — first decluttering/furnishing, then color —
 * is far more reliable because each call has exactly one job.
 *
 * @param {object} config
 * @param {string} config.roomType
 * @param {string} config.furnitureMode - 'declutter' | 'furnish' (never called for 'keep')
 * @returns {{ prompt: string } | null} null if furnitureMode is 'keep' (nothing to do)
 */
function buildFurniturePrompt(config) {
  const furnitureMode = config.furnitureMode || 'keep';
  const instruction = FURNITURE_INSTRUCTIONS[furnitureMode];
  if (!instruction) return null;
  const roomLabel = config.roomType ? config.roomType.replace(/-/g, ' ') : 'room';

  const prompt = [
    `This is a real photo of a ${roomLabel}.`,
    instruction,
    `Keep the exact same camera angle, perspective, room architecture, wall color/material, floor color/material, ceiling, windows, doors, and lighting exactly as they are in the original photo — this step should change only the furniture/objects as described above, nothing else.`,
    `The result should be a single photorealistic image, indistinguishable from a real photograph of the same room.`
  ].filter(Boolean).join(' ');

  return { prompt };
}

/**
 * @param {object} config
 * @param {string} config.roomType - e.g. "living-room"
 * @param {string} config.scope - "walls-only" | "floors-only" | "walls-floors" | "accent-wall"
 * @param {string} config.style - Luxora style id, e.g. "modern-premium"
 * @param {string} [config.wallColorName] @param {string} [config.wallColorHex] @param {string} [config.wallDesign]
 * @param {string} [config.floorColorName] @param {string} [config.floorColorHex] @param {string} [config.floorDesign]
 * @param {'safe'|'elegant'|'premium'|'wow'} variantId
 * @param {object} [opts]
 * @param {boolean} [opts.skipFurnitureInstruction] - true when this call runs
 *   AFTER a separate buildFurniturePrompt() step already handled furniture —
 *   in that case this prompt must only touch color/material, not furniture.
 */
function buildPrompt(config, variantId, opts = {}) {
  const intensity = VARIANT_INTENSITY[variantId] || VARIANT_INTENSITY.safe;
  const styleWords = STYLE_LABELS[config.style] || config.style || '';
  const scopeDescription = describeScope(config);
  const roomLabel = config.roomType ? config.roomType.replace(/-/g, ' ') : 'room';
  const furnitureMode = config.furnitureMode || 'keep';
  const skipFurniture = !!opts.skipFurnitureInstruction;
  const furnitureInstruction = skipFurniture ? '' : (FURNITURE_INSTRUCTIONS[furnitureMode] || '');

  // What must stay untouched, phrased as one natural clause (not a labeled
  // "KEEP UNCHANGED:" list) — three variants depending on furniture mode:
  // - 'keep' (default): furniture stays untouched.
  // - furniture already handled in a prior step (skipFurniture): the
  //   furniture now in the photo is final, don't touch it here.
  // - furniture instruction included in THIS same call: only mention the
  //   non-furniture things that must stay put, so it doesn't contradict the
  //   furniture instruction above it.
  let keepClause;
  if (furnitureMode === 'keep') {
    keepClause = 'Everything else — the furniture, decor, windows, doors, ceiling, and light sources — should stay exactly as they appear in the original photo; only the walls and/or floor described above should change.';
  } else if (skipFurniture) {
    keepClause = "Everything else — the room's layout, windows, doors, ceiling, and light sources, along with the furniture/objects already shown in this photo (final and intentional) — should stay exactly as they appear; only the walls and/or floor described above should change.";
  } else {
    keepClause = "Aside from the furniture change described above, everything else — the room's layout, windows, doors, ceiling, and light sources — should stay exactly as they appear in the original photo.";
  }

  // Written as ONE flowing paragraph, in plain natural language, the way
  // you'd brief a real interior designer or photo retoucher — no ALL-CAPS
  // section labels, and each instruction stated only once (no repeated
  // "reminder" at the end). See the file header comment for why: a prior,
  // labeled/repeated/checklist-style version of this prompt was tested live
  // and made the model apply near-zero visible change. A confirmed-working
  // prompt (tested independently against this same model) used exactly this
  // natural, single-sentence-per-idea style, so this rewrite follows it.
  const prompt = [
    `This is a real photo of a ${roomLabel} that needs a photorealistic interior renovation edit for a sales presentation — keep the exact same room, structure, camera angle, perspective, and lighting as the original photo.`,
    furnitureInstruction,
    scopeDescription,
    keepClause,
    `Aim for a ${styleWords} interior design feel, rendered with ${intensity.styleModifiers}.`,
    `The result should be a single photorealistic image of this exact room after the renovation, not a generic stock photo of a similar room.`
  ].filter(Boolean).join(' ');

  return { prompt };
}

/**
 * Builds the prompt for the "AI Suggestions" feature: analyzes the room
 * photo's FIXED elements (cabinets, countertop, backsplash, existing wall/
 * floor) that will NOT be changed, then asks for 2-3 cohesive wall + floor
 * recommendations, each one picked from Luxora's own color/design catalog
 * (passed in below) so the result can be used directly by the same
 * generation pipeline as a manually-picked color — no new data shape needed
 * downstream. Uses Gemini's JSON mode (see lib/gemini.js analyzeImage()).
 *
 * @param {object} config
 * @param {string} config.roomType
 * @param {boolean} config.needsWalls - true if this project's scope includes walls
 * @param {boolean} config.needsFloors - true if this project's scope includes floors
 * @param {Array}  config.wallColorFamilies - LUXORA.WALL_COLOR_FAMILIES-shaped catalog
 * @param {Array}  config.floorColorFamilies - LUXORA.FLOOR_COLOR_FAMILIES-shaped catalog
 * @param {string[]} config.wallDesigns - LUXORA.WALL_DESIGNS
 * @param {string[]} config.floorDesigns - LUXORA.FLOOR_DESIGNS
 */
function buildSuggestionPrompt(config) {
  const roomLabel = config.roomType ? config.roomType.replace(/-/g, ' ') : 'room';
  const needsWalls = config.needsWalls !== false;
  const needsFloors = config.needsFloors !== false;

  const wallCatalog = (config.wallColorFamilies || [])
    .map(f => `${f.label}: ${f.colors.map(c => `${c.name} (${c.hex})`).join(', ')}`).join(' | ');
  const floorCatalog = (config.floorColorFamilies || [])
    .map(f => `${f.label}: ${f.colors.map(c => `${c.name} (${c.hex})`).join(', ')}`).join(' | ');
  const wallDesignCatalog = (config.wallDesigns || []).join(', ');
  const floorDesignCatalog = (config.floorDesigns || []).join(', ');

  const schemaFields = [];
  if (needsWalls) schemaFields.push('"wallColorName" (string, EXACT name from the wall color catalog), "wallColorHex" (string, the EXACT hex from the wall color catalog that matches wallColorName), "wallDesign" (string, EXACT name from the wall design catalog)');
  if (needsFloors) schemaFields.push('"floorColorName" (string, EXACT name from the floor color catalog), "floorColorHex" (string, the EXACT hex from the floor color catalog that matches floorColorName), "floorDesign" (string, EXACT name from the floor design catalog)');

  const prompt = [
    `You are a professional interior designer looking at a real photo of a ${roomLabel}.`,
    `STEP 1 — Identify the FIXED elements in this photo that will NOT be changed by this renovation: cabinet color/material/finish (if visible), countertop color/material (if visible), backsplash color/style (if visible), current wall color, and current floor color/material. Be specific and concise.`,
    `STEP 2 — Based on those fixed elements, recommend ${needsWalls && needsFloors ? '2 to 3 cohesive wall-color + floor-color/design combinations' : needsWalls ? '2 to 3 wall-color options' : '2 to 3 floor-color/design options'} that would look cohesive and elevate this specific room, reasoning explicitly about how each recommendation relates to the existing fixed elements you identified (e.g. "warm cherry cabinets + black countertops → a white marble floor with gray veining ties in the black countertops, while warm gold veining echoes the cherry wood tones").`,
    `IMPORTANT CONSTRAINT: you must choose each recommended color/design ONLY from the exact catalogs below — do not invent new names or hex codes, and do not alter the hex values. Pick whichever catalog entries best match your professional recommendation.`,
    needsWalls ? `WALL COLOR CATALOG (name (hex), grouped by family): ${wallCatalog}` : '',
    needsWalls ? `WALL DESIGN/FINISH CATALOG: ${wallDesignCatalog}` : '',
    needsFloors ? `FLOOR COLOR CATALOG (name (hex), grouped by family): ${floorCatalog}` : '',
    needsFloors ? `FLOOR DESIGN/FINISH CATALOG: ${floorDesignCatalog}` : '',
    `Respond ONLY with JSON matching exactly this shape (no extra commentary, no markdown fences):`,
    `{"fixedElements": {"cabinets": string, "countertop": string, "backsplash": string, "currentWallColor": string, "currentFloorColor": string}, "suggestions": [{"label": string (e.g. "Recommended", "Alternative", "Bold Option"), "reasoning": string (1-2 sentences explaining why this combination works with the fixed elements), ${schemaFields.join(', ')}}]}`,
    `If a fixed element is not visible/applicable in the photo, use an empty string "" for it. Return between 2 and 3 items in "suggestions".`
  ].filter(Boolean).join(' ');

  return { prompt };
}

module.exports = { VARIANT_INTENSITY, FURNITURE_INSTRUCTIONS, buildPrompt, buildFurniturePrompt, buildSuggestionPrompt };
