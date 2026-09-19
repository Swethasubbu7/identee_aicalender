import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api/calendar-designs";

const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const getMyDesigns = async () => {
  const response = await axios.get(API_BASE_URL, { headers: authHeaders() });
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
