const express = require('express');
const { editImage } = require('../lib/gemini');
const { buildFurniturePrompt } = require('../lib/promptBuilder');

const router = express.Router();

/**
 * POST /api/prepare-room
 * Body: {
 *   image: string,       // data URL of the room photo
 *   roomType: string,    // Luxora room type id, e.g. "kitchen"
 *   furnitureMode: 'keep' | 'declutter' | 'furnish'
 * }
 * Returns: { imageUrl }  // data URL — either the original photo unchanged
 *                        // (furnitureMode 'keep'), or a single furniture-only
 *                        // edited version (decluttered or newly furnished).
 *
 * WHY THIS IS A SEPARATE, ONE-TIME STEP (instead of doing it inside
 * generate-variant.js for each of the 4 variants):
 * Furniture removal/addition is a creative, somewhat unpredictable edit —
 * running it 4 separate times (once per Safe/Elegant/Premium/Wow call)
 * produced inconsistent results in testing: some variants ended up with the
 * room fully emptied, while others (e.g. "Wow") kept the original dining
 * table and chairs untouched. Running it exactly ONCE here, then reusing
 * that single decluttered/furnished photo as the base image for all 4
 * color/material variants, guarantees all 4 results share the identical
 * furniture state — consistent with Luxora's "obedience priority" rule that
 * all 4 variants must represent the same underlying scene.
 */
router.post('/', async (req, res) => {
  try {
    const { image, roomType, furnitureMode } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Missing required field: image.' });
    }

    const match = /^data:(.+?);base64,(.+)$/.exec(image);
    if (!match) {
      return res.status(400).json({ error: 'image must be a base64 data URL, e.g. "data:image/jpeg;base64,...".' });
    }
    const mimeType = match[1];
    const imageBase64 = match[2];

    const furniturePrompt = buildFurniturePrompt({ roomType, furnitureMode });

    // 'keep' (or unrecognized) mode: nothing to do, hand the original photo
    // straight back so the frontend always has a single, consistent
    // "prepared image" to use for the next step regardless of furnitureMode.
    if (!furniturePrompt) {
      return res.json({ imageUrl: image });
    }

    const result = await editImage({ imageBase64, mimeType, prompt: furniturePrompt.prompt });

    res.json({
      imageUrl: `data:${result.mimeType};base64,${result.base64}`
    });
  } catch (err) {
    console.error('[prepare-room] error:', err);
    res.status(500).json({ error: err.message || 'Room preparation failed.' });
  }
});

module.exports = router;
