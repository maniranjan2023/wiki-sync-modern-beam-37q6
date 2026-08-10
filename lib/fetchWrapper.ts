'use client'

import { isInIframe } from "@/components/ErrorBoundary";

const sendErrorToParent = (
  message: string,
  status?: number,
  endpoint?: string,
) => {
  console.error(`[FetchWrapper] ${message}`, { status, endpoint });

  if (isInIframe()) {
    window.parent.postMessage(
      {
        source: "architect-child-app",
        type: "CHILD_APP_ERROR",
        payload: {
          type: status && status >= 500 ? "api_error" : "network_error",
          message,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          endpoint,
          status,
        },
      },
      "*",
    );
  }
};

const fetchWrapper = async (...args: Parameters<typeof fetch>): Promise<Response | undefined> => {
  try {
    const response = await fetch(...args);

    // if backend sent a redirect
    if (response.redirected) {
      window.location.href = response.url; // update ui to go to the redirected UI (often /login)
      return;
    }

    // Tool authentication required on /api/agent - inspect body for tool_auth keyword
    const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (requestUrl.includes("/api/agent")) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const cloned = response.clone();
        try {
          const body = await cloned.json();
          const bodyStr = JSON.stringify(body);
          if (bodyStr.includes("tool_auth") && isInIframe()) {
            // Structured response (HTTP 401 from proxy)
            const detail = body?.detail;
            // Stringified error (HTTP 200 from Lyzr async task)
            const errorStr = body?.error || body?.response?.message || "";

            const toolName = detail?.tool_name || errorStr.match?.(/['"]tool_name['"]:\s*['"]([^'"]+)['"]/)?.[1];
            const toolSource = detail?.tool_source || errorStr.match?.(/['"]tool_source['"]:\s*['"]([^'"]+)['"]/)?.[1];
            const reason = detail?.reason || errorStr.match?.(/['"]reason['"]:\s*['"]([^'"]+)['"]/)?.[1];
            const actionNames = detail?.action_names || (() => {
              const raw = errorStr.match?.(/['"]action_names['"]:\s*\[([^\]]+)\]/)?.[1];
              return raw ? raw.match(/['"]([^'"]+)['"]/g)?.map((s: string) => s.replace(/['"]/g, "")) : undefined;
            })();

            window.parent.postMessage(
              {
                source: "architect-child-app",
                type: "TOOL_AUTH_REQUIRED",
                payload: {
                  tool_name: toolName,
                  tool_source: toolSource,
                  action_names: actionNames,
                  reason: reason,
                },
              },
              "*",
            );
          }
        } catch {
          // JSON parse failed, ignore
        }
      }
    }

    const isApiRoute = requestUrl.startsWith("/api/");

    if (response.status == 404 && !isApiRoute) {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/html")) {
        const html = await response.text();

        // Replace entire current page with returned HTML
        document.open();
        document.write(html);
        document.close();

        return;
      } else {
        sendErrorToParent(
          `Backend returned 404 Not Found for ${requestUrl}`,
          404,
          requestUrl,
        );
      }
    } // 4xx on /api/ routes are valid by-design responses — let the app handle them
    // 5xx always escalates: API routes reserve it for genuine server/upstream
    // failures (agent-level failures arrive as 200 + success:false), so
    // suppressing any 5xx here would hide real outages.
    else if (response.status >= 500) {
      sendErrorToParent(
        `Backend returned ${response.status} error for ${requestUrl}`,
        response.status,
        requestUrl,
      );
    }

    return response;
  } catch (error) {
    // network failures
    const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    sendErrorToParent(
      `Network error: Cannot connect to backend (${requestUrl})`,
      undefined,
      requestUrl,
    );
  }
};

export default fetchWrapper;
