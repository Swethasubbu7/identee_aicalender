import axios from "axios";
import { apiUrl, authHeaders } from "../config";

const API_BASE_URL = apiUrl("/api/calendar-designs");

export const getMyDesigns = async ({ limit } = {}) => {
  const response = await axios.get(API_BASE_URL, { params: limit ? { limit } : {}, headers: authHeaders() });
  return response.data;
};

export const createDraft = async (payload) => {
  const response = await axios.post(API_BASE_URL, payload, {
    headers: authHeaders(),
  });
  return response.data;
};

export const getDesign = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/${id}`, {
    headers: authHeaders(),
  });
  return response.data;
};

export const updateDesign = async (id, payload) => {
  const response = await axios.put(`${API_BASE_URL}/${id}`, payload, {
    headers: authHeaders(),
  });
  return response.data;
};

export const autosaveDesign = async (id, payload) => {
  const response = await axios.post(`${API_BASE_URL}/${id}/autosave`, payload, {
    headers: authHeaders(),
  });
  return response.data;
};

// Designer content image (god image / product photo) → { path, url, widthPx, heightPx }
export const uploadDesignImage = async (file) => {
  const fd = new FormData();
  fd.append("image", file);
  const response = await axios.post(`${API_BASE_URL}/uploads`, fd, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

// Small picture of the design for the project cards (replaces the previous one).
export const uploadDesignThumbnail = async (id, blob) => {
  const fd = new FormData();
  fd.append("thumbnail", blob, "thumbnail.jpg");
  const response = await axios.put(`${API_BASE_URL}/${id}/thumbnail`, fd, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

// Deletes one of the designer's own drafts. Its generated designs are kept.
export const deleteDesign = async (id) => {
  const response = await axios.delete(`${API_BASE_URL}/${id}`, { headers: authHeaders() });
  return response.data;
};

// Deletes the designer's own selected drafts → { deleted: [id], notFound: [id] }.
// Generated designs, layouts and production files are never affected.
export const bulkDeleteDesigns = async (ids) => {
  const response = await axios.post(`${API_BASE_URL}/bulk-delete`, { ids }, { headers: authHeaders() });
  return response.data;
};

// Free God-image tools on the server (no AI): op "remove-background" | "enhance".
// Returns a NEW image { path, url, widthPx, heightPx, … } to preview before applying.
export const processGodImage = async ({ source, op, targetLongPx }) => {
  const response = await axios.post(`${API_BASE_URL}/god-image/process`, { source, op, targetLongPx }, { headers: authHeaders() });
  return response.data;
};
