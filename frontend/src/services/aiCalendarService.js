import axios from "axios";
import { apiUrl, authHeaders } from "../config";

const API_BASE_URL = apiUrl("/api/ai-calendars");
const variationUrl = (id, index, action) => `${API_BASE_URL}/${id}/variations/${index}/${action}`;

// All AI calls run on the server; the browser never holds the API key.
// payload: { variantId, designId, businessName, productList, address, godImage, productImage, prompt,
//            options…, confirmCost?, confirmedEstimateInr? } — AI mode needs the cost confirmation.
export const startAiCalendarJob = async (payload) => {
  const response = await axios.post(API_BASE_URL, payload, { headers: authHeaders() });
  return response.data.job;
};

// What Generate will make in each mode:
//   { layoutCode, aiEnabled, normal: { designCount, recipes }, ai: { designCount, recipes, estimate, limits, note } }
export const getAiLayoutPlan = async (variantId, prompt = "") => {
  const response = await axios.get(`${API_BASE_URL}/plan`, { params: { variantId, prompt }, headers: authHeaders() });
  return response.data;
};

// Exactly ONE AI image through the same safeguards (cost
// confirmation: { confirmCost: true, confirmedEstimateInr }).
export const startAdminTestImage = async (payload) => {
  const response = await axios.post(`${API_BASE_URL}/test-image`, payload, { headers: authHeaders() });
  return response.data.job;
};

// Saves the chosen design as a NEW reusable layout (draft): { _id, code, name, status, validation }.
export const saveDesignAsLayout = async (id, index, name) => {
  const response = await axios.post(variationUrl(id, index, 'save-layout'), { name }, { headers: authHeaders() });
  return response.data.layout;
};

// The designer's generations (newest first) for the gallery.
export const listAiCalendarJobs = async ({ limit } = {}) => {
  const response = await axios.get(API_BASE_URL, { params: limit ? { limit } : {}, headers: authHeaders() });
  return response.data.jobs;
};

// Saves the finished design picture shown in the gallery.
export const saveAiVariationPreview = async (id, index, blob) => {
  const fd = new FormData();
  fd.append("preview", blob, "preview.jpg");
  const response = await axios.put(variationUrl(id, index, "preview"), fd, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const getAiCalendarJob = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/${id}`, { headers: authHeaders() });
  return response.data.job;
};

// One paid request: needs { confirmCost: true, confirmedEstimateInr } (see CostConfirmDialog).
export const regenerateAiCalendarVariation = async (id, index, confirmation = {}) => {
  const response = await axios.post(variationUrl(id, index, "regenerate"), confirmation, { headers: authHeaders() });
  return response.data.job;
};

// textFits: { regionId: { fittedPt, layoutPt } } measured while drawing the design.
export const printCheckAiCalendar = async (id, index, { textFits, productChoice }) => {
  const response = await axios.post(variationUrl(id, index, "print-check"), { textFits, productChoice }, {
    headers: authHeaders(),
  });
  return response.data;
};

export const prepareAiCalendarExport = async (id, index) => {
  const response = await axios.post(variationUrl(id, index, "prepare-export"), null, { headers: authHeaders() });
  return response.data;
};

// The layout's production PDF (owner of the job only), as an ArrayBuffer.
export const fetchAiCalendarSourcePdf = async (id, index) => {
  const response = await axios.get(variationUrl(id, index, "source.pdf"), {
    headers: authHeaders(),
    responseType: "arraybuffer",
  });
  return response.data;
};

export const uploadAiCalendarExport = async (id, index, artworkBlob, productChoice = "original") => {
  const fd = new FormData();
  fd.append("productChoice", productChoice);
  fd.append("artwork", artworkBlob, artworkBlob.type === "image/png" ? "artwork.png" : "artwork.jpg");
  const response = await axios.post(variationUrl(id, index, "export"), fd, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

// Saves an exported PDF to the designer's computer. kind: "print" | "cutline"
export const downloadAiCalendarPdf = async (id, index, kind) => {
  const response = await axios.get(variationUrl(id, index, `download/${kind}`), {
    headers: authHeaders(),
    responseType: "blob",
  });
  const disposition = response.headers["content-disposition"] || "";
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(disposition)?.[1] || `calendar-${kind}.pdf`;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = decodeURIComponent(name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
