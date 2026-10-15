import axios from "axios";
import { apiUrl, authHeaders } from "../config";

const API_BASE_URL = apiUrl("/api/calendar-formats");

// Fixed sizes (with their cake size) offered for one cut type.
export const getCalendarFormats = async (cutType) => {
  const response = await axios.get(API_BASE_URL, {
    params: cutType ? { cutType } : {},
    headers: authHeaders(),
  });
  return response.data;
};
