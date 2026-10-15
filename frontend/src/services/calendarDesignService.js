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

// Deletes the designer's own project (and its AI designs).
export const deleteDesign = async (id) => {
  const response = await axios.delete(`${API_BASE_URL}/${id}`, { headers: authHeaders() });
  return response.data;
};
