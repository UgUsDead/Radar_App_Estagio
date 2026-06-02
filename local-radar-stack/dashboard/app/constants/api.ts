if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_API_BASE) {
  // console.debug("NEXT_PUBLIC_API_BASE is not set. Falling back to current host.");
}
export const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? (typeof window !== "undefined" ? `http://${window.location.hostname}:4000` : "http://localhost:4000");
