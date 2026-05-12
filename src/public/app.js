function outputFor(actionName) {
    const wrapper = document.querySelector(`[data-output-wrapper-for="${CSS.escape(actionName)}"]`);
    const body = document.querySelector(`[data-output-for="${CSS.escape(actionName)}"]`);
    return { wrapper, body };
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

async function readNdjson(response, body) {
    if (!response.body) {
        body.textContent = "(empty response body)";
        return;
    }
    body.textContent = "";
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

    wrapper.hidden = false;
    body.textContent = `Running ${actionName}...\n`;
    triggerButton.setAttribute("aria-busy", "true");
    triggerButton.disabled = true;

    try {
        const response = await fetch(`/action/${encodeURIComponent(actionName)}`);
        const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
        if (contentType.includes("application/x-ndjson")) {
            await readNdjson(response, body);
        } else {
            const text = await response.text();
            try {
                body.textContent = JSON.stringify(JSON.parse(text), null, 2);
            } catch {
                body.textContent = text;
            }
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
