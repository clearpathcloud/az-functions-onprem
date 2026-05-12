window.addEventListener("DOMContentLoaded", () => {
    window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        docExpansion: "list",
    });
});
