// Retired 2026-10-12: the old single-image endpoint called Gemini directly,
// outside the usage ledger, spending limits and cost confirmation. All AI
// work now goes through POST /api/ai-calendars. This handler never contacts
// any provider.
const generateDesigns = (req, res) =>
  res.status(410).json({
    message: "This endpoint is retired. Use Generate on the Customise page (POST /api/ai-calendars).",
  });

module.exports = { generateDesigns };
