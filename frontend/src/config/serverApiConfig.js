export const API_BASE_URL =
  import.meta.env.VITE_BACKEND_SERVER + "api/";

export const BASE_URL =
  import.meta.env.VITE_BACKEND_SERVER;

export const WEBSITE_URL =
  import.meta.env.PROD
    ? "http://cloud.idurarapp.com/"
    : "http://localhost:3000/";

export const DOWNLOAD_BASE_URL =
  import.meta.env.VITE_BACKEND_SERVER + "download/";

export const ACCESS_TOKEN_NAME = "x-auth-token";

export const FILE_BASE_URL =
  import.meta.env.VITE_FILE_BASE_URL;