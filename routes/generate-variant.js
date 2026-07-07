const express = require('express');
const { editImage } = require('../lib/gemini');
const { buildPrompt, buildFurniturePrompt, VARIANT_INTENSITY } = require('../lib/promptBuilder');

const router = express.Router();

/**
 * POST /api/generate-variant
 * Body: {
 *   image: string,            // data URL of the room photo, e.g. "data:image/jpeg;base64,..."
 *   roomType: string,         // Luxora room type id, e.g. "living-room"
 *   scope: string,            // "walls-only" | "floors-only" | "walls-floors" | "accent-wall"
 *   style: string,            // Luxora style id, e.g. "modern-premium"
 *   wallColorName, wallColorHex, wallDesign,   // present if scope needs walls
 *   floorColorName, floorColorHex, floorDesign, // present if scope needs floors
 *   furnitureMode: 'keep' | 'declutter' | 'furnish',  // optional, defaults to 'keep'
 *   variantId: 'safe' | 'elegant' | 'premium' | 'wow'
 * }
 * Returns: { variantId, imageUrl }   // imageUrl is a data: URL of the edited photo
 *
 * No image segmentation / mask is needed — the Gemini image-editing model
 * edits the whole photo directly from a text instruction, in a single call,
 * updating walls and/or floor together as the scope requires.
 */
router.post('/', async (req, res) => {
  try {
    const { image, roomType, scope, style, variantId,
      wallColorName, wallColorHex, wallDesign,
      floorColorName, floorColorHex, floorDesign,
      furnitureMode } = req.body || {};

    const missing = ['image', 'scope', 'style', 'variantId'].filter(k => !req.body || !req.body[k]);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
    }
    if (!VARIANT_INTENSITY[variantId]) {
      return res.status(400).json({ error: `Invalid variantId. Must be one of: ${Object.keys(VARIANT_INTENSITY).join(', ')}` });
    }
    const needsWalls = ['walls-only', 'walls-floors', 'accent-wall'].includes(scope);
    const needsFloors = ['floors-only', 'walls-floors'].includes(scope);
    if (needsWalls && !wallColorHex) {
      return res.status(400).json({ error: 'Missing wallColorHex/wallColorName/wallDesign for this scope.' });
    }
    if (needsFloors && !floorColorHex) {
      return res.status(400).json({ error: 'Missing floorColorHex/floorColorName/floorDesign for this scope.' });
    }

    // Parse the incoming data URL into raw base64 + mime type.
    const match = /^data:(.+?);base64,(.+)$/.exec(image);
    if (!match) {
      return res.status(400).json({ error: 'image must be a base64 data URL, e.g. "data:image/jpeg;base64,...".' });
    }
    const mimeType = match[1];
    const imageBase64 = match[2];

    // Two-step pipeline when furniture must change: doing furniture and
    // color/material in one single instruction was unreliable (Gemini would
    // often skip or under-apply the furniture change in favor of the color
    // change). Splitting into two focused, sequential edit calls — first
    // declutter/furnish, then color — is much more reliable because each
    // call has exactly one job.
    let workingBase64 = imageBase64;
    let workingMimeType = mimeType;

    const furniturePrompt = buildFurniturePrompt({ roomType, furnitureMode });
    if (furniturePrompt) {
      const step1 = await editImage({ imageBase64: workingBase64, mimeType: workingMimeType, prompt: furniturePrompt.prompt });
      workingBase64 = step1.base64;
      workingMimeType = step1.mimeType;
    }

    const { prompt } = buildPrompt(
      { roomType, scope, style, wallColorName, wallColorHex, wallDesign, floorColorName, floorColorHex, floorDesign, furnitureMode },
      variantId,
      { skipFurnitureInstruction: Boolean(furniturePrompt) }
    );

    const result = await editImage({ imageBase64: workingBase64, mimeType: workingMimeType, prompt });

    res.json({
      variantId,
      imageUrl: `data:${result.mimeType};base64,${result.base64}`
    });
  } catch (err) {
    console.error('[generate-variant] error:', err);
    res.status(500).json({ error: err.message || 'Generation failed.' });
  }
});

module.exports = router;



