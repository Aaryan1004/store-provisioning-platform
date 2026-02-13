import axios from "axios";

export const api = axios.create({
  baseURL: "http://api.localhost:8080/api",
});
