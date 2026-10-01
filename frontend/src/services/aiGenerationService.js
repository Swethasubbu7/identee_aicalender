import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api/ai-generate";

const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// formData must include a "customerImage" file field plus the design
// settings (designerPrompt, cutType, year, language, monthStyle,
// aiThemeMatching, layoutId). Currently hits a stub backend endpoint —
// see aiGeneration.controller.js. No Gemini call happens yet.
export const generateAIDesigns = async (formData) => {
  const response = await axios.post(API_BASE_URL, formData, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};
