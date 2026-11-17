// Saves a downloaded file (axios response with responseType "blob") under the
// name the server gave in Content-Disposition.
export const saveDownload = (response, fallbackName) => {
  const disposition = response.headers?.["content-disposition"] || "";
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = decodeURIComponent(name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// A failed blob request carries its JSON message as a Blob: read it.
export const downloadErrorMessage = async (err, fallback) => {
  try {
    const data = err?.response?.data;
    const text = data instanceof Blob ? await data.text() : null;
    return (text && JSON.parse(text).message) || err?.response?.data?.message || fallback;
  } catch {
    return fallback;
  }
};
