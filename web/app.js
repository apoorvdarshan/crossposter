const searchInput = document.querySelector("#doc-search");
const sections = Array.from(document.querySelectorAll(".doc-section"));
const navLinks = Array.from(document.querySelectorAll(".side-nav a"));
const backToTop = document.querySelector(".back-to-top");
const copyButtons = Array.from(document.querySelectorAll(".copy-button"));

function normalize(value) {
  return value.trim().toLowerCase();
}

function updateSearch() {
  if (!searchInput) {
    return;
  }

  const query = normalize(searchInput.value);

  sections.forEach((section) => {
    const haystack = normalize(`${section.textContent || ""} ${section.dataset.search || ""}`);
    section.classList.toggle("is-hidden", Boolean(query) && !haystack.includes(query));
  });
}

function updateActiveNav() {
  let activeId = "";
  const offset = 140;

  sections.forEach((section) => {
    if (section.classList.contains("is-hidden")) {
      return;
    }

    const rect = section.getBoundingClientRect();

    if (rect.top <= offset) {
      activeId = section.id;
    }
  });

  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === `#${activeId}`);
  });

  backToTop?.classList.toggle("is-visible", window.scrollY > 600);
}

searchInput?.addEventListener("input", () => {
  updateSearch();
  updateActiveNav();
});

window.addEventListener("scroll", updateActiveNav, { passive: true });
window.addEventListener("resize", updateActiveNav);

backToTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const targetId = button.getAttribute("data-copy-target");
    const target = targetId ? document.getElementById(targetId) : null;
    const text = target?.textContent || "";

    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      button.classList.add("is-copied");
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.classList.remove("is-copied");
        button.textContent = "Copy";
      }, 1600);
    } catch {
      button.textContent = "Select text";
    }
  });
});

updateActiveNav();
