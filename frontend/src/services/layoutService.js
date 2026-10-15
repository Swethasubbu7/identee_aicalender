import axios from "axios";
import { apiUrl, authHeaders } from "../config";

const API_BASE_URL = apiUrl("/api/layouts");

export const getLayouts = async (filters = {}) => {
  const params = {};
  if (filters.type && filters.type !== "all") params.type = filters.type;
  if (filters.size && filters.size !== "all") params.size = filters.size;
  if (filters.search) params.search = filters.search;

  const response = await axios.get(API_BASE_URL, { params });
  return response.data;
};

export const getLayoutById = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/${id}`);
  return response.data;
};

export const uploadLayout = async (formData) => {
  const response = await axios.post(API_BASE_URL, formData, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const updateLayout = async (id, formData) => {
  const response = await axios.put(`${API_BASE_URL}/${id}`, formData, {
    headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const deactivateLayout = async (id) => {
  const response = await axios.delete(`${API_BASE_URL}/${id}`, {
    headers: authHeaders(),
  });
  return response.data;
};
