(function () {
  try {
    var stored = localStorage.getItem("cloudcompass_theme");
    var parsed = stored ? JSON.parse(stored) : null;
    var theme =
      parsed === "dark" || parsed === "light"
        ? parsed
        : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    document.documentElement.className = theme;
  } catch (e) {
    document.documentElement.className = "light";
  }
})();
