const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector("#site-nav");
const searchInput = document.querySelector("#docs-search");
const sections = Array.from(document.querySelectorAll(".doc-section"));
const sidebarLinks = Array.from(document.querySelectorAll(".docs-sidebar a"));
const copyButtons = Array.from(document.querySelectorAll(".copy-button"));
const backToTop = document.querySelector(".back-to-top");
const themeButton = document.querySelector(".theme-button");
const themeButtonLabel = themeButton?.querySelector("span");
const themeButtonIcon = themeButton?.querySelector("img");
const themeStorageKey = "crossposter-web-theme";

function normalize(value) {
  return value.trim().toLowerCase();
}

function updateSearch() {
  const query = normalize(searchInput?.value || "");

  sections.forEach((section) => {
    const text = normalize(`${section.textContent || ""} ${section.dataset.search || ""}`);
    section.classList.toggle("is-hidden", Boolean(query) && !text.includes(query));
  });
}

function updateActiveSection() {
  let activeId = "";

  sections.forEach((section) => {
    if (section.classList.contains("is-hidden")) {
      return;
    }

    if (section.getBoundingClientRect().top <= 120) {
      activeId = section.id;
    }
  });

  sidebarLinks.forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === `#${activeId}`);
  });

  backToTop?.classList.toggle("is-visible", window.scrollY > 700);
}

function setTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";

  document.documentElement.dataset.theme = nextTheme;
  try {
    localStorage.setItem(themeStorageKey, nextTheme);
  } catch {}

  if (themeButton) {
    const isDark = nextTheme === "dark";

    themeButton.setAttribute("aria-pressed", String(isDark));
    themeButton.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
  }

  if (themeButtonLabel) {
    themeButtonLabel.textContent = nextTheme === "dark" ? "Dark" : "Light";
  }

  if (themeButtonIcon) {
    themeButtonIcon.src = nextTheme === "dark" ? "assets/ui/moon.svg" : "assets/ui/sun.svg";
  }
}

menuButton?.addEventListener("click", () => {
  const isOpen = nav?.classList.toggle("is-open") || false;
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

themeButton?.addEventListener("click", () => {
  const currentTheme = document.documentElement.dataset.theme || "dark";

  setTheme(currentTheme === "dark" ? "light" : "dark");
});

searchInput?.addEventListener("input", () => {
  updateSearch();
  updateActiveSection();
});

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const targetId = button.getAttribute("data-copy-target");
    const target = targetId ? document.getElementById(targetId) : null;
    const value = target?.textContent || "";

    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      button.classList.add("is-copied");
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.classList.remove("is-copied");
        button.textContent = "Copy";
      }, 1400);
    } catch {
      button.textContent = "Select";
    }
  });
});

backToTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("scroll", updateActiveSection, { passive: true });
window.addEventListener("resize", updateActiveSection);
setTheme(document.documentElement.dataset.theme || "dark");
updateActiveSection();
