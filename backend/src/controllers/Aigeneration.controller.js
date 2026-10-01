const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const BACKEND_ORIGIN = "http://localhost:5000";

const generatedDir = path.join(
  __dirname,
  "..",
  "uploads",
  "ai-generate",
  "generated",
);
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BASE_INSTRUCTION =
  "Enhance this photo for use inside a printed calendar: increase " +
  "resolution and sharpness, correct exposure and color balance. Do NOT " +
  "change the composition, crop, aspect ratio, or add/remove any people " +
  "or objects unless explicitly asked. Keep the subject and framing " +
  "exactly as provided.";

const generateDesigns = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Customer image is required" });
    }

    const {
      designerPrompt = "",
      cutType = "normal",
      year,
      language = "english",
      monthStyle = "full",
      aiThemeMatching,
      layoutId,
    } = req.body;

    const sourceImageUrl = `${BACKEND_ORIGIN}/uploads/ai-generate/${req.file.filename}`;

   
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    const finalPrompt = designerPrompt
      ? `${BASE_INSTRUCTION} Additional instructions from the designer: ${designerPrompt}`
      : BASE_INSTRUCTION;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        { text: finalPrompt },
        { inlineData: { mimeType, data: base64Image } },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData);

    if (!imagePart) {
      console.error("Gemini returned no image part:", JSON.stringify(parts));
      return res.status(502).json({
        message: "AI generation did not return an image. Please try again.",
      });
    }

    const outputBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    const outputExt = imagePart.inlineData.mimeType?.includes("png")
      ? "png"
      : "jpg";
    const outputFilename = `${Date.now()}-generated.${outputExt}`;
    fs.writeFileSync(path.join(generatedDir, outputFilename), outputBuffer);

    const generatedImageUrl = `${BACKEND_ORIGIN}/uploads/ai-generate/generated/${outputFilename}`;

    res.status(200).json({
      message: "Design generated",
      status: "success",
      input: {
        layoutId: layoutId || null,
        sourceImageUrl,
        designerPrompt,
        cutType,
        year: year ? Number(year) : undefined,
        language,
        monthStyle,
        aiThemeMatching: aiThemeMatching === "true" || aiThemeMatching === true,
      },
      generatedDesigns: [{ url: generatedImageUrl }],
    });
  } catch (error) {
    console.error("AI generate error:", error);
    res.status(500).json({ message: "Failed to generate AI design" });
  }
};

module.exports = { generateDesigns };
