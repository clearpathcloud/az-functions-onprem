function outputFor(actionName) {
    const wrapper = document.querySelector(`[data-output-wrapper-for="${CSS.escape(actionName)}"]`);
    const body = document.querySelector(`[data-output-for="${CSS.escape(actionName)}"]`);
    return { wrapper, body };
}

function requestBodyFor(actionName) {
    return document.querySelector(`[data-body-for="${CSS.escape(actionName)}"]`);
}

function formatBodyText(text) {
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

function responsePrefix(response) {
    if (response.ok) return "";
    const lines = [`HTTP ${response.status} ${response.statusText || "Error"}`];
    const retryAfter = response.headers.get("retry-after");
    const requestId = response.headers.get("x-request-id");
    if (retryAfter) lines.push(`Retry-After: ${retryAfter}`);
    if (requestId) lines.push(`Request-Id: ${requestId}`);
    return `${lines.join("\n")}\n\n`;
}

function readJsonBody(actionName) {
    const bodyInput = requestBodyFor(actionName);
    const rawBody = bodyInput instanceof HTMLTextAreaElement ? bodyInput.value.trim() : "{}";
    JSON.parse(rawBody || "{}");
    return rawBody || "{}";
}

function appendChunk(body, line) {
    if (!line) return;
    try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === "object" && "error" in parsed) {
            body.textContent += `ERROR: ${parsed.error}\n`;
        } else {
            body.textContent += JSON.stringify(parsed) + "\n";
        }
    } catch {
        body.textContent += line + "\n";
    }
    body.scrollTop = body.scrollHeight;
}

async function readNdjson(response, body, prefix = "") {
    if (!response.body) {
        body.textContent = `${prefix}(empty response body)`;
        return;
    }
    body.textContent = prefix;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) appendChunk(body, line);
    }
    if (buffer) appendChunk(body, buffer);
}

async function runAction(actionName, triggerButton) {
    const { wrapper, body } = outputFor(actionName);
    if (!wrapper || !body) return;

    const method = (triggerButton.dataset.method || "GET").toUpperCase();

    wrapper.hidden = false;
    body.textContent = `Running ${actionName} (${method})...\n`;
    triggerButton.setAttribute("aria-busy", "true");
    triggerButton.disabled = true;

    try {
        const init = { method };
        if (method === "POST") {
            try {
                init.body = readJsonBody(actionName);
            } catch (error) {
                body.textContent = `Invalid JSON body: ${error instanceof Error ? error.message : String(error)}`;
                return;
            }
            init.headers = { "Content-Type": "application/json" };
        }
        const response = await fetch(`/action/${encodeURIComponent(actionName)}`, init);
        const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
        const statusPrefix = responsePrefix(response);
        if (contentType.includes("application/x-ndjson")) {
            await readNdjson(response, body, statusPrefix);
        } else {
            const text = await response.text();
            body.textContent = statusPrefix + formatBodyText(text);
        }
    } catch (error) {
        body.textContent += `\nRequest failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
        triggerButton.removeAttribute("aria-busy");
        triggerButton.disabled = false;
    }
}

document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const closeButton = target.closest("[data-close-output]");
    if (closeButton instanceof HTMLElement && closeButton.dataset.closeOutput) {
        event.preventDefault();
        const { wrapper, body } = outputFor(closeButton.dataset.closeOutput);
        if (wrapper) wrapper.hidden = true;
        if (body) body.textContent = "";
        return;
    }

    const actionTrigger = target.closest("[data-action]");
    if (actionTrigger instanceof HTMLButtonElement && actionTrigger.dataset.action) {
        event.preventDefault();
        runAction(actionTrigger.dataset.action, actionTrigger);
    }
});
