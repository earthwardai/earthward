// Applies a saved theme before first paint. External file so the strict CSP allows it.
document.documentElement.classList.add("js");
try {
  var t = localStorage.getItem("ew_theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
