const express = require('express');
const { analyzeImage } = require('../lib/gemini');
const { buildSuggestionPrompt } = require('../lib/promptBuilder');

const router = express.Router();

/**
 * POST /api/suggest-design
 * Body: {
 *   image: string,             // data URL of the room photo
 *   roomType: string,          // Luxora room type id, e.g. "kitchen"
 *   needsWalls: boolean,       // does this project's scope include walls?
 *   needsFloors: boolean,      // does this project's scope include floors?
 *   wallColorFamilies: array,  // LUXORA.WALL_COLOR_FAMILIES (sent by the frontend
 *                              // so the backend never has its own copy of the
 *                              // catalog to keep in sync)
 *   floorColorFamilies: array, // LUXORA.FLOOR_COLOR_FAMILIES
 *   wallDesigns: string[],     // LUXORA.WALL_DESIGNS
 *   floorDesigns: string[]     // LUXORA.FLOOR_DESIGNS
 * }
 * Returns: {
 *   fixedElements: { cabinets, countertop, backsplash, currentWallColor, currentFloorColor },
 *   suggestions: [{ label, reasoning, wallColorName?, wallColorHex?, wallDesign?, floorColorName?, floorColorHex?, floorDesign? }]
 * }
 *
 * Uses a Gemini TEXT/vision model (not the image-editing model) to read the
 * photo and pick recommendations from Luxora's own catalog, so the result
 * can be applied directly by the existing /api/generate-variant pipeline —
 * exactly as if the user had picked those colors manually.
 */
router.post('/', async (req, res) => {
  try {
    const {
      image, roomType, needsWalls, needsFloors,
      wallColorFamilies, floorColorFamilies, wallDesigns, floorDesigns
    } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Missing required field: image.' });
    }

    const match = /^data:(.+?);base64,(.+)$/.exec(image);
    if (!match) {
      return res.status(400).json({ error: 'image must be a base64 data URL, e.g. "data:image/jpeg;base64,...".' });
    }
    const mimeType = match[1];
    const imageBase64 = match[2];

    const { prompt } = buildSuggestionPrompt({
      roomType, needsWalls, needsFloors,
      wallColorFamilies, floorColorFamilies, wallDesigns, floorDesigns
    });

    const result = await analyzeImage({ imageBase64, mimeType, prompt });

    if (!result || !Array.isArray(result.suggestions)) {
      return res.status(502).json({ error: 'AI suggestion response was missing the expected "suggestions" list.', raw: result });
    }

    res.json(result);
  } catch (err) {
    console.error('[suggest-design] error:', err);
    res.status(500).json({ error: err.message || 'Suggestion generation failed.' });
  }
});

module.exports = router;
