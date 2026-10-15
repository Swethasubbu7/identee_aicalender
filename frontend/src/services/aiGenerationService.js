import axios from "axios";
import { apiUrl, authHeaders } from "../config";

const API_BASE_URL = apiUrl("/api/ai-generate");

// formData must include a "customerImage" file field plus the design
// settings (designerPrompt, cutType, sizeCode, year, language, monthStyle,
// aiThemeMatching, layoutId). The backend calls Gemini and returns
// generatedDesigns: [{ url }].
export const generateAIDesigns = async (formData) => {
  const response = await axios.post(API_BASE_URL, formData, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};
