import axios from "axios";
import { apiUrl, authHeaders } from "../config";

const API_BASE_URL = apiUrl("/api/layout-variants");

// Production layouts (every signed-in designer receives all of them).
export const listLayoutVariants = async (filters = {}) => {
  const params = {};
  if (filters.cutType && filters.cutType !== "all") params.cutType = filters.cutType;
  if (filters.sizeCode) params.sizeCode = filters.sizeCode;
  const response = await axios.get(API_BASE_URL, { params, headers: authHeaders() });
  return response.data;
};

export const getLayoutVariant = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/${id}`, { headers: authHeaders() });
  return response.data;
};

// formData: productionPdf, familyCode, familyName, cutType, sizeCode, replace?
export const importProductionPdf = async (formData, onUploadProgress) => {
  const response = await axios.post(`${API_BASE_URL}/import`, formData, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
  return response.data;
};

// Adds / replaces the laser-cutting PDF of a layout (back to Draft).
export const uploadLaserPdf = async (id, file) => {
  const fd = new FormData();
  fd.append("laserPdf", file);
  const response = await axios.post(`${API_BASE_URL}/${id}/laser`, fd, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const getImportedObjects = async (id, page) => {
  const response = await axios.get(`${API_BASE_URL}/${id}/objects`, {
    params: { page },
    headers: authHeaders(),
  });
  return response.data;
};

export const saveLayoutMapping = async (id, mapping) => {
  const response = await axios.put(`${API_BASE_URL}/${id}/mapping`, mapping, {
    headers: authHeaders(),
  });
  return response.data;
};

// formData: frame (PNG) and/or preview (PNG/JPEG)
export const uploadLayoutAssets = async (id, formData) => {
  const response = await axios.post(`${API_BASE_URL}/${id}/assets`, formData, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

const postAction = (action) => async (id) => {
  const response = await axios.post(`${API_BASE_URL}/${id}/${action}`, null, {
    headers: authHeaders(),
  });
  return response.data;
};

export const validateLayoutVariant = postAction("validate");
// Re-read the stored production PDF and rebuild from the saved mapping.
export const reextractLayoutVariant = postAction("reextract");
export const activateLayoutVariant = postAction("activate");
export const deactivateLayoutVariant = postAction("deactivate");
export const archiveLayoutVariant = postAction("archive");

// Any layout. Validated / active ones need confirmCode = the layout code.
export const deleteLayoutVariant = async (id, confirmCode) => {
  const response = await axios.delete(`${API_BASE_URL}/${id}`, {
    params: confirmCode ? { confirm: confirmCode } : {},
    headers: authHeaders(),
  });
  return response.data;
};

// Cutline size correction: proposal, apply (confirmed), undo.
export const getLayoutCorrection = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/${id}/correction`, { headers: authHeaders() });
  return response.data;
};
export const applyLayoutCorrection = async (id) => {
  const response = await axios.post(`${API_BASE_URL}/${id}/correction`, { confirm: true }, { headers: authHeaders() });
  return response.data;
};
export const undoLayoutCorrection = async (id) => {
  const response = await axios.delete(`${API_BASE_URL}/${id}/correction`, { headers: authHeaders() });
  return response.data;
};

// Artwork quality: replacement artwork (real resolution counts) or a
// labelled upscaled preview (never counts as print quality).
export const uploadLayoutArtwork = async (id, file) => {
  const fd = new FormData();
  fd.append("artwork", file);
  const response = await axios.post(`${API_BASE_URL}/${id}/artwork`, fd, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};
export const upscaleLayoutArtwork = async (id) => {
  const response = await axios.post(`${API_BASE_URL}/${id}/artwork/upscale`, null, { headers: authHeaders() });
  return response.data;
};
export const removeLayoutArtwork = async (id) => {
  const response = await axios.delete(`${API_BASE_URL}/${id}/artwork`, { headers: authHeaders() });
  return response.data;
};

// Image-quality improvement: plan (DPI, target, AI availability + cost),
// make an enhanced candidate, approve or discard it.
export const getArtworkEnhancePlan = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/${id}/artwork/enhance`, { headers: authHeaders() });
  return response.data;
};
export const enhanceLayoutArtwork = async (id, method, confirmation = {}) => {
  const response = await axios.post(`${API_BASE_URL}/${id}/artwork/enhance`, { method, ...confirmation }, { headers: authHeaders() });
  return response.data;
};
export const approveArtworkCandidate = async (id) => {
  const response = await axios.post(`${API_BASE_URL}/${id}/artwork/candidate/approve`, null, { headers: authHeaders() });
  return response.data;
};
export const discardArtworkCandidate = async (id) => {
  const response = await axios.delete(`${API_BASE_URL}/${id}/artwork/candidate`, { headers: authHeaders() });
  return response.data;
};
