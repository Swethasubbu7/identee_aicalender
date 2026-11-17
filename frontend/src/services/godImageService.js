import axios from "axios";
import { apiUrl, authHeaders } from "../config";

// Default God-image library (search by name or alias; no AI involved).
const API_BASE_URL = apiUrl("/api/god-images");

export const searchGodImages = async (q = "") => {
  const response = await axios.get(API_BASE_URL, { params: q ? { q } : {}, headers: authHeaders() });
  return response.data.images || [];
};

// { file, name, aliases } → { image } (409 with { image } when the same picture is already saved)
export const addGodImage = async ({ file, name, aliases }) => {
  const form = new FormData();
  form.append("image", file);
  form.append("name", name);
  form.append("aliases", aliases || "");
  const response = await axios.post(API_BASE_URL, form, { headers: authHeaders() });
  return response.data.image;
};

// { name?, aliases?, active? } — the picture itself never changes.
export const updateGodImage = async (id, patch) => {
  const response = await axios.put(`${API_BASE_URL}/${id}`, patch, { headers: authHeaders() });
  return response.data.image;
};
