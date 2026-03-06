export const API_BASE_URL =
  import.meta.env.MODE === "production"
    ? (import.meta.env.VITE_BACKEND_SERVER || "https://idurar-erp-crm-gyyk.onrender.com/") + "api/"
    : "http://localhost:8888/api/";

export const BASE_URL =
  import.meta.env.MODE === "production"
    ? (import.meta.env.VITE_BACKEND_SERVER || "https://idurar-erp-crm-gyyk.onrender.com/")
    : "http://localhost:8888/";

export const WEBSITE_URL =
  import.meta.env.MODE === "production"
    ? (import.meta.env.VITE_BACKEND_SERVER || "https://idurar-erp-crm-gyyk.onrender.com/")
    : "http://localhost:3000/";

export const DOWNLOAD_BASE_URL =
  import.meta.env.MODE === "production"
    ? (import.meta.env.VITE_BACKEND_SERVER || "https://idurar-erp-crm-gyyk.onrender.com/") + "download/"
    : "http://localhost:8888/download/";

export const ACCESS_TOKEN_NAME = "x-auth-token";

export const FILE_BASE_URL =
  import.meta.env.MODE === "production"
    ? (import.meta.env.VITE_BACKEND_SERVER || "https://idurar-erp-crm-gyyk.onrender.com/")
    : "http://localhost:8888/";