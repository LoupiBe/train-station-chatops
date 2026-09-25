/**
 * functions/api/_lib/http.js
 * Shared HTTP response helpers and CORS headers for Cloudflare Pages Functions.
 */

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, cf-access-authenticated-user-email",
  "Access-Control-Max-Age": "86400",
};

/**
 * Creates a JSON HTTP response with CORS headers.
 * @param {any} data
 * @param {number} [status=200]
 * @param {HeadersInit} [extraHeaders={}]
 * @returns {Response}
 */
export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

/**
 * Creates a structured JSON error response with CORS headers.
 * @param {string} message
 * @param {number} [status=400]
 * @param {object} [options={}]
 * @param {string} [options.code="ERROR"]
 * @param {boolean} [options.conflict=false]
 * @param {any} [options.details=null]
 * @returns {Response}
 */
export function errorResponse(message, status = 400, { code = "ERROR", conflict = false, details = null } = {}) {
  const body = {
    error: message,
    code,
  };
  if (conflict) body.conflict = true;
  if (details) body.details = details;

  return jsonResponse(body, status);
}

/**
 * Handles OPTIONS preflight requests.
 * @returns {Response}
 */
export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
