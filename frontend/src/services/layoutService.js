import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api/layouts";

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
